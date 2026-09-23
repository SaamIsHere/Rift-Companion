#!/usr/bin/env node
/**
 * OP.GG → Rift Companion data adapter.
 *
 * Fetches real champion statistics from the OP.GG Gaming Data API (the public
 * `opgg-mcp` endpoint) and emits the normalized `Champion[]` JSON that the Rust
 * `ingest` CLI consumes. Static fields (icon key, display name, frontline) come
 * from Riot's Data Dragon. This is the only OP.GG-specific code in the project —
 * the importer, repository, and engine stay source-agnostic.
 *
 * Usage:
 *   npx tsx scripts/ingest-opgg.ts [--positions top,jungle,mid,adc,support]
 *                                  [--limit N] [--tier all|emerald|...]
 *                                  [--delay 150] [--out opgg-stats.json]
 * Then install it:
 *   <target>/debug/rift-companion.exe ingest opgg-stats.json
 */

import { writeFileSync } from "node:fs";

const ENDPOINT = "https://mcp-api.op.gg/mcp";
const DDRAGON = "https://ddragon.leagueoflegends.com";
export const ALL_POSITIONS = ["top", "jungle", "mid", "adc", "support"] as const;
export type Position = (typeof ALL_POSITIONS)[number];

// All 5 lanes; the crawl loop skips the subject's own position (querying
// lol_get_champion_synergies for my_position === synergy_position isn't
// meaningful). Omitting "top" here dropped every top-lane synergy (Issue #20)
// back when this list fed the embedded data.synergies.<pos> field.
export const SYNERGY_POSITIONS = ["top", "jungle", "mid", "adc", "support"] as const;

export interface RoleMatchupStat {
  winrate: number;
  games: number;
}

export interface ChampionRoleStats {
  global_winrate: number;
  games: number;
  matchups: Record<string, RoleMatchupStat>;
  synergies: Record<string, RoleMatchupStat>;
}

export interface IngestChampionRecord {
  champion_id: number;
  name: string;
  image: string;
  damage: "physical" | "magic" | "mixed";
  frontline: boolean;
  roles: string[];
  stats: Record<string, ChampionRoleStats>;
}

interface DataDragonMeta {
  id: number;
  key: string;
  name: string;
  tags: string[];
}

interface DataDragonResult {
  version: string;
  byId: Map<number, DataDragonMeta>;
  resolve: Map<string, number>;
}

// ---------- args ----------
const args = process.argv.slice(2);
const getArg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const positions = getArg("positions", "top,jungle,mid,adc,support")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const limit = Number(getArg("limit", "0")) || Infinity; // champions per position
const tier = getArg("tier", ""); // "" = all-tier aggregate
const delayMs = Number(getArg("delay", "150"));
const outPath = getArg("out", "opgg-stats.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------- OP.GG response DSL parser ----------
// Text is `class Name: f1,f2,...` headers + one nested-constructor expression.
export function parseOpgg(text: string): any {
  const lines = text.split(/\r?\n/);
  const classes: Record<string, string[]> = {};
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^class\s+(\w+):\s*(.*)$/);
    if (m) classes[m[1]] = m[2].split(",").map((s) => s.trim()).filter(Boolean);
    else if (lines[i].trim() === "") continue;
    else {
      start = i;
      break;
    }
  }
  const s = lines.slice(start).join("\n").trim();
  let p = 0;
  const ws = () => {
    while (p < s.length && /\s/.test(s[p])) p++;
  };
  const value = (): any => {
    ws();
    const c = s[p];
    if (c === '"') return str();
    if (c === "[") return arr();
    if (/[A-Za-z_]/.test(c)) return identOrCtor();
    return num();
  };
  const str = (): string => {
    p++;
    let o = "";
    while (p < s.length) {
      const c = s[p++];
      if (c === "\\") o += s[p++];
      else if (c === '"') break;
      else o += c;
    }
    return o;
  };
  const arr = (): any[] => {
    p++;
    const a: any[] = [];
    ws();
    if (s[p] === "]") {
      p++;
      return a;
    }
    for (;;) {
      a.push(value());
      ws();
      if (s[p] === ",") {
        p++;
        continue;
      }
      break;
    }
    ws();
    if (s[p] === "]") p++;
    return a;
  };
  const identOrCtor = (): any => {
    const st = p;
    while (p < s.length && /[A-Za-z0-9_]/.test(s[p])) p++;
    const id = s.slice(st, p);
    ws();
    if (s[p] === "(") {
      p++;
      const a: any[] = [];
      ws();
      if (s[p] !== ")")
        for (;;) {
          a.push(value());
          ws();
          if (s[p] === ",") {
            p++;
            continue;
          }
          break;
        }
      ws();
      if (s[p] === ")") p++;
      const f = classes[id];
      if (f) {
        const o: Record<string, any> = {};
        f.forEach((k, i) => (o[k] = a[i]));
        return o;
      }
      return { __class: id, args: a };
    }
    if (id === "true") return true;
    if (id === "false") return false;
    if (id === "null" || id === "None") return null;
    return id;
  };
  const num = (): number | string => {
    const st = p;
    while (p < s.length && /[-0-9.eE+]/.test(s[p])) p++;
    const t = s.slice(st, p);
    const n = Number(t);
    return Number.isNaN(n) ? t : n;
  };
  return value();
}

// ---------- minimal MCP client (Streamable HTTP / JSON-RPC) ----------
let sessionId: string | null = null;
async function rpc(method: string, params?: Record<string, any> | null, isNotification = false): Promise<any> {
  const body: Record<string, any> = {
    jsonrpc: "2.0",
    method,
    ...(isNotification ? {} : { id: Math.floor(Math.random() * 1e9) }),
    ...(params ? { params } : {}),
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  if (isNotification) return null;
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    const msgs: any[] = [];
    for (const l of text.split(/\r?\n/)) {
      if (l.startsWith("data:")) {
        const d = l.slice(5).trim();
        if (d) {
          try {
            msgs.push(JSON.parse(d));
          } catch {}
        }
      }
    }
    return msgs.find((m) => m.result || m.error) || msgs[0];
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callTool(name: string, argsObj: Record<string, any>): Promise<any> {
  const msg = await rpc("tools/call", { name, arguments: argsObj });
  if (msg?.error) throw new Error(`${name}: ${JSON.stringify(msg.error)}`);
  const t = msg?.result?.content?.find((c: any) => c.type === "text")?.text;
  return t ? parseOpgg(t) : msg?.result;
}

// ---------- helpers ----------
export const mapDamage = (d: string): "physical" | "magic" | "mixed" =>
  d === "AP" ? "magic" : d === "BOTH" ? "mixed" : "physical";

// Data Dragon CamelCase key -> OP.GG UPPER_SNAKE champion arg (e.g. XinZhao -> XIN_ZHAO).
export const championArg = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();

export async function loadDataDragon(): Promise<DataDragonResult> {
  const versions: string[] = await fetch(`${DDRAGON}/api/versions.json`).then((r) => r.json());
  const version = versions[0];
  const champ = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`).then((r) => r.json());
  const byId = new Map<number, DataDragonMeta>(); // riot id -> {id, key, name, tags}
  const resolve = new Map<string, number>(); // various string forms -> riot id
  for (const e of Object.values<any>(champ.data)) {
    const id = Number(e.key); // e.key is the numeric Riot id (as string)
    const rec: DataDragonMeta = { id, key: e.id, name: e.name, tags: e.tags || [] };
    byId.set(id, rec);
    resolve.set(e.id, id); // CamelCase key
    resolve.set(e.name, id); // display name
    resolve.set(championArg(e.id), id); // UPPER_SNAKE
  }
  return { version, byId, resolve };
}

// ---------- main ----------
(async () => {
  console.log(
    `OP.GG adapter — positions=${positions.join(",")} limit=${limit === Infinity ? "all" : limit} tier=${tier || "all"}`
  );
  const dd = await loadDataDragon();
  console.log(`Data Dragon ${dd.version}, ${dd.byId.size} champions`);

  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "rift-companion-ingest", version: "0.1.0" },
  });
  await rpc("notifications/initialized", null, true);

  // 1) Per-position roster + global win rate / games, via lane meta.
  const work: Array<{ id: number; role: string; key: string }> = [];
  const champs = new Map<number, IngestChampionRecord>(); // id -> normalized champion record
  for (const pos of positions) {
    const fields = ["champion", "win_rate", "play", "role_rate", "tier"].map(
      (f) => `data.positions.${pos}[].${f}`
    );
    const meta = await callTool("lol_list_lane_meta_champions", {
      position: pos,
      desired_output_fields: fields,
    });
    const list = meta?.data?.positions?.[pos] || [];
    let n = 0;
    for (const row of list) {
      if (n >= limit) break;
      const id = typeof row.champion === "number" ? row.champion : dd.resolve.get(row.champion);
      if (!id) continue;
      const meta2 = dd.byId.get(id);
      if (!meta2) continue;
      if (!champs.has(id)) {
        champs.set(id, {
          champion_id: id,
          name: meta2.name,
          image: meta2.key,
          damage: "physical",
          frontline: meta2.tags.includes("Tank"),
          roles: [],
          stats: {},
        });
      }
      const rec = champs.get(id)!;
      if (!rec.roles.includes(pos)) rec.roles.push(pos);
      rec.stats[pos] = {
        global_winrate: round3(row.win_rate),
        games: row.play | 0,
        matchups: {},
        synergies: {},
      };
      work.push({ id, role: pos, key: meta2.key });
      n++;
    }
    console.log(`  ${pos}: ${n} champions`);
    await sleep(delayMs);
  }

  // 2) Per (champion, role): damage type, matchups, synergies.
  console.log(`Fetching analysis for ${work.length} champion/role pairs...`);
  let done = 0;
  let skipped = 0;
  for (const { id, role, key } of work) {
    const rec = champs.get(id)!;
    const fields = [
      "data.damage_type",
      "data.strong_counters[].champion_id",
      "data.strong_counters[].win_rate",
      "data.strong_counters[].play",
      "data.weak_counters[].champion_id",
      "data.weak_counters[].win_rate",
      "data.weak_counters[].play",
      "data.summary.positions[].counters[].champion_id",
      "data.summary.positions[].counters[].win",
      "data.summary.positions[].counters[].play",
    ];
    try {
      const an = await callTool("lol_get_champion_analysis", {
        game_mode: "ranked",
        champion: championArg(key),
        position: role,
        ...(tier ? { tier } : {}),
        desired_output_fields: fields,
      });
      const d = an?.data || {};
      if (d.damage_type) rec.damage = mapDamage(d.damage_type);
      const rs = rec.stats[role];
      // strong_counters: the subject IS the favoured side -> use directly.
      for (const sc of d.strong_counters || []) {
        if (sc?.champion_id != null) {
          rs.matchups[sc.champion_id] = { winrate: round3(sc.win_rate), games: sc.play | 0 };
        }
      }
      // weak_counters: the opponent is the favoured side -> invert for my WR.
      for (const wc of d.weak_counters || []) {
        if (wc?.champion_id != null) {
          rs.matchups[wc.champion_id] = { winrate: round3(1 - wc.win_rate), games: wc.play | 0 };
        }
      }
      // Broaden matchup coverage beyond the top-3-each strong/weak lists using
      // the per-position counters list (raw win/play, no polarity ambiguity);
      // don't overwrite cells already classified above.
      for (const pos of d.summary?.positions || []) {
        for (const c of pos.counters || []) {
          if (c?.champion_id == null || !c.play) continue;
          if (rs.matchups[c.champion_id] == null) {
            rs.matchups[c.champion_id] = { winrate: round3((c.win | 0) / c.play), games: c.play | 0 };
          }
        }
      }
      // The embedded data.synergies.* field only returns ~3 partners per ally
      // lane; the dedicated lol_get_champion_synergies tool returns ~10 for
      // the same pairing (verified live: Lucian/adc+support went from
      // {Yuumi, Leona, Nautilus} to 10 entries including Braum) — worth 4
      // extra calls per champion/role to widen the hover preview's
      // (Issue #17) ally-side coverage.
      for (const sp of SYNERGY_POSITIONS) {
        if (sp === role) continue;
        try {
          const syn = await callTool("lol_get_champion_synergies", {
            champion: championArg(key),
            my_position: role,
            synergy_position: sp,
            desired_output_fields: [
              "data.synergies[].synergy_champion_id",
              "data.synergies[].win_rate",
              "data.synergies[].play",
            ],
          });
          for (const s of syn?.data?.synergies || []) {
            if (s?.synergy_champion_id != null) {
              rs.synergies[s.synergy_champion_id] = { winrate: round3(s.win_rate), games: s.play | 0 };
            }
          }
        } catch (e: any) {
          console.warn(`  skip synergies ${key}/${role} vs ${sp}: ${e.message}`);
        }
        await sleep(delayMs);
      }
    } catch (e: any) {
      skipped++;
      if (skipped <= 8) console.warn(`  skip ${key}/${role}: ${e.message}`);
    }
    if (++done % 20 === 0) console.log(`  ...${done}/${work.length}`);
    await sleep(delayMs);
  }

  // 3) Emit normalized Champion[] JSON. roles[0] is the champion's *primary*
  // role (used to infer hidden enemy positions), so order roles by actual play
  // volume rather than the fixed position-crawl order (Issue #19).
  const out = [...champs.values()].filter((c) => Object.keys(c.stats).length > 0);
  for (const c of out) {
    c.roles.sort((a, b) => (c.stats[b]?.games || 0) - (c.stats[a]?.games || 0));
  }
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const matchups = out.reduce(
    (a, c) => a + Object.values(c.stats).reduce((b, s) => b + Object.keys(s.matchups).length, 0),
    0
  );
  const synergies = out.reduce(
    (a, c) => a + Object.values(c.stats).reduce((b, s) => b + Object.keys(s.synergies).length, 0),
    0
  );
  console.log(
    `\nWrote ${out.length} champions (${matchups} matchup cells, ${synergies} synergy cells, ${skipped} skipped) -> ${outPath}`
  );
  console.log(`Install with:  rift-companion.exe ingest ${outPath}`);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
