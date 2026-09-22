import fs from "node:fs/promises";
import path from "node:path";
import { McpClient } from "./opgg.mjs";

const DDRAGON = "https://ddragon.leagueoflegends.com";
const ALL_POSITIONS = ["top", "jungle", "mid", "adc", "support"];
const SYNERGY_POSITIONS = ["top", "jungle", "mid", "adc", "support"];
const MIN_TIER_SAMPLE_GAMES = 300;

export const SUPPORTED_TIERS = [
  "diamond_plus",
  "emerald_plus",
  "platinum_plus",
  "gold_plus",
  "silver_plus",
  "bronze_plus",
  "iron_plus",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round3 = (x) => Math.round(x * 10000) / 10000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const mapDamage = (d) => (d === "AP" ? "magic" : d === "BOTH" ? "mixed" : "physical");

// Data Dragon CamelCase key -> OP.GG UPPER_SNAKE champion argument (e.g. XinZhao -> XIN_ZHAO).
export function championArg(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * Executes async tasks with bounded concurrency.
 */
async function asyncPool(concurrency, items, fn) {
  const ret = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

export async function fetchLatestDdragonVersion() {
  const res = await fetch(`${DDRAGON}/api/versions.json`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiftServer/1.0" },
  });
  const versions = await res.json();
  return versions[0];
}

export async function loadDataDragon() {
  const version = await fetchLatestDdragonVersion();
  const res = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiftServer/1.0" },
  });
  const champ = await res.json();
  const byId = new Map();
  const resolve = new Map();
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const e of Object.values(champ.data)) {
    const id = Number(e.key);
    const rec = { id, key: e.id, name: e.name, tags: e.tags || [] };
    byId.set(id, rec);
    resolve.set(e.id, id);
    resolve.set(e.name, id);
    resolve.set(championArg(e.id), id);
    resolve.set(norm(e.id), id);
    resolve.set(norm(e.name), id);
  }

  // Load item.json for canonical item names
  const itemRes = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/item.json`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiftServer/1.0" },
  }).catch(() => null);
  const itemJson = itemRes?.ok ? await itemRes.json() : null;
  const itemsById = new Map();
  if (itemJson?.data) {
    for (const [idStr, item] of Object.entries(itemJson.data)) {
      itemsById.set(Number(idStr), item.name);
    }
  }

  // Load summoner.json for canonical summoner spell names
  const summonerRes = await fetch(`${DDRAGON}/cdn/${version}/data/en_US/summoner.json`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiftServer/1.0" },
  }).catch(() => null);
  const summonerJson = summonerRes?.ok ? await summonerRes.json() : null;
  const spellsById = new Map();
  if (summonerJson?.data) {
    for (const spell of Object.values(summonerJson.data)) {
      spellsById.set(Number(spell.key), spell.name);
    }
  }

  return { version, byId, resolve, norm, itemsById, spellsById };
}

/**
 * Fetches the full counter matchup table directly from OP.GG's webpage
 * (which renders 30-60 matchups per champion & position).
 */
export async function fetchOpggHtmlCounters(championKey, role, tier, dd) {
  const slug = championKey.toLowerCase();
  const url = `https://op.gg/lol/champions/${slug}/counters/${role}?tier=${tier}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return {};
    const html = await res.text();
    const ulStart = html.indexOf('<ul class="border-t border-t-gray-200">');
    if (ulStart === -1) return {};
    const ulEnd = html.indexOf("</ul>", ulStart);
    const ulContent = html.slice(ulStart, ulEnd + 5);
    const liMatches = [...ulContent.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    const matchups = {};

    for (const li of liMatches) {
      const text = li[1];
      const nameMatch = text.match(/<span class="[^"]*text-xs font-bold[^"]*">([^<]+)<\/span>/);
      const wrMatch = text.match(/<strong class="[^"]*">([0-9.]+)%<\/strong>/);
      const gamesMatch = text.match(/<span class="[^"]*text-gray-600[^"]*">([^<]+)<\/span>/);
      if (nameMatch && wrMatch) {
        const oppName = nameMatch[1].trim();
        const oppId = dd.resolve.get(oppName) || dd.resolve.get(dd.norm(oppName));
        if (oppId) {
          const wr = round4(parseFloat(wrMatch[1]) / 100);
          const games = gamesMatch ? parseInt(gamesMatch[1].replace(/,/g, ""), 10) || 0 : 0;
          matchups[oppId] = { winrate: wr, games };
        }
      }
    }
    return matchups;
  } catch {
    return {};
  }
}

/**
 * Fetches the full synergy pairing table directly from OP.GG's webpage
 * (which renders 30-50 synergies across other roles with exact 2-decimal winrates).
 */
export async function fetchOpggHtmlSynergies(championKey, role, tier, dd) {
  const slug = championKey.toLowerCase();
  const url = `https://op.gg/lol/champions/${slug}/synergies/${role}?tier=${tier}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return {};
    const html = await res.text();
    const trMatches = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const synergies = {};

    for (const tr of trMatches) {
      const rowHtml = tr[1];
      const champMatch =
        rowHtml.match(/<strong class="[^"]*group-hover:underline[^"]*">([^<]+)<\/strong>/) ||
        rowHtml.match(/href="\/lol\/champions\/([^\/]+)\/build/);
      const gamesMatch = rowHtml.match(/<div class="text-gray-500">([0-9,]+)<\/div>/);
      const wrMatches = [...rowHtml.matchAll(/<strong[^>]*class="[^"]*tabular-nums[^"]*"[^>]*>([0-9.]+)%<\/strong>/g)];

      if (champMatch && wrMatches.length >= 2) {
        const allyName = champMatch[1].trim();
        const allyId = dd.resolve.get(allyName) || dd.resolve.get(dd.norm(allyName));
        if (allyId) {
          const wr = round4(parseFloat(wrMatches[1][1]) / 100);
          const games = gamesMatch ? parseInt(gamesMatch[1].replace(/,/g, ""), 10) || 0 : 0;
          synergies[allyId] = { winrate: wr, games };
        }
      }
    }
    return synergies;
  } catch {
    return {};
  }
}

/**
 * Fetches and parses full build recommendations (runes, summoner spells,
 * skill order, starter items, boots, core item builds, 4th, 5th, 6th items)
 * directly from OP.GG's webpage for a champion & position.
 */
export async function fetchOpggBuildData(championKey, role, tier, dd) {
  const slug = championKey.toLowerCase();
  const url = `https://www.op.gg/champions/${slug}/build/${role}?tier=${tier}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const chunkRegex = /self\.__next_f\.push\(\[1,"(.*?[^\\])"\]\)/gs;
    const chunkMap = new Map();
    let fullStream = "";
    for (const m of html.matchAll(chunkRegex)) {
      try {
        const unescaped = JSON.parse(`"${m[1]}"`);
        fullStream += unescaped;
      } catch {}
    }

    if (!fullStream) return null;

    const lines = fullStream.split("\n");
    let curId = null;
    let curContent = [];
    for (const line of lines) {
      const m = line.match(/^([0-9a-f]+):(.*)$/);
      if (m) {
        if (curId !== null) chunkMap.set(curId, curContent.join("\n"));
        curId = m[1];
        curContent = [m[2]];
      } else {
        if (curId !== null) curContent.push(line);
      }
    }
    if (curId !== null) chunkMap.set(curId, curContent.join("\n"));

    const parsedChunks = new Map();
    function getParsedChunk(id) {
      if (parsedChunks.has(id)) return parsedChunks.get(id);
      const raw = chunkMap.get(id);
      if (!raw) return null;
      try {
        const val = JSON.parse(raw);
        parsedChunks.set(id, val);
        return val;
      } catch {
        return null;
      }
    }

    function resolveNode(node, depth = 0) {
      if (depth > 75 || node == null) return node;
      if (typeof node === "string") {
        const m = node.match(/^\$L([0-9a-f]+)$/);
        if (m) {
          const resolved = getParsedChunk(m[1]);
          return resolveNode(resolved, depth + 1);
        }
        return node;
      }
      if (Array.isArray(node)) {
        return node.map((item) => resolveNode(item, depth + 1));
      }
      if (typeof node === "object") {
        const res = {};
        for (const [k, v] of Object.entries(node)) {
          res[k] = resolveNode(v, depth + 1);
        }
        return res;
      }
      return node;
    }

    function findRows(node, keyPrefix) {
      const rows = [];
      function walk(n) {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) {
          if (
            n[0] === "$" &&
            n[1] === "tr" &&
            typeof n[2] === "string" &&
            n[2].startsWith(keyPrefix)
          ) {
            rows.push({ key: n[2], content: n[3] });
          }
          for (const item of n) walk(item);
        } else {
          for (const v of Object.values(n)) walk(v);
        }
      }
      walk(node);
      return rows;
    }

    function getItemName(id, alt) {
      return dd?.itemsById?.get(id) || alt || `Item ${id}`;
    }

    function getSpellName(id, alt) {
      return dd?.spellsById?.get(id) || alt || `Spell ${id}`;
    }

    function parseRow(rowNode) {
      const str = JSON.stringify(rowNode);
      const itemIds = [];
      const itemNames = [];
      const itemRegex = /"metaType":"item","metaId":(\d+)[^}]*?(?:"alt":"([^"]+)")?/g;
      let m;
      while ((m = itemRegex.exec(str)) !== null) {
        const id = parseInt(m[1], 10);
        itemIds.push(id);
        itemNames.push(getItemName(id, m[2]));
      }

      const prMatch = str.match(/"tabular-nums","children":"([0-9.]+)%"\}/);
      const wrMatch = str.match(/tabular-nums text-[^"]*","children":"([0-9.]+)%"\}/);
      let games = null;
      const gMatch1 = str.match(/"children":"([0-9,]+) Games"\}/);
      const gMatch2 = str.match(/"children":\["([0-9,]+)","\s*","Games"\]/);
      if (gMatch1) games = parseInt(gMatch1[1].replace(/,/g, ""), 10);
      else if (gMatch2) games = parseInt(gMatch2[1].replace(/,/g, ""), 10);

      return {
        ids: itemIds,
        names: itemNames,
        pick_rate: prMatch ? round3(parseFloat(prMatch[1]) / 100) : null,
        win_rate: wrMatch ? round3(parseFloat(wrMatch[1]) / 100) : null,
        play: games,
      };
    }

    const result = {
      runes: [],
      summoner_spells: [],
      skill_order: null,
      starter_items: [],
      support_items: [],
      boots: [],
      core_items: [],
      fourth_items: [],
      fifth_items: [],
      sixth_items: [],
    };

    // 1. Runes from {"data":{"rune_pages":[...
    const runeMatch = fullStream.match(/\{"data":\{"rune_pages":\[/);
    if (runeMatch) {
      let braceCount = 0;
      let started = false;
      let endIdx = -1;
      for (let i = runeMatch.index; i < fullStream.length; i++) {
        if (fullStream[i] === "{") {
          braceCount++;
          started = true;
        } else if (fullStream[i] === "}") {
          braceCount--;
          if (braceCount === 0 && started) {
            endIdx = i;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        try {
          const runeData = JSON.parse(fullStream.slice(runeMatch.index, endIdx + 1));
          const pages = runeData.data?.rune_pages || [];
          for (const page of pages.slice(0, 2)) {
            const b = page.builds?.[0];
            if (!b) continue;

            const primaryRunes = [];
            for (const row of b.main_runes || []) {
              const active = row.find((r) => r.isActive);
              if (active) primaryRunes.push({ id: active.id, name: active.name });
            }

            const secondaryRunes = [];
            for (const row of b.sub_runes || []) {
              const active = row.find((r) => r.isActive);
              if (active) secondaryRunes.push({ id: active.id, name: active.name });
            }

            const shards = [];
            for (const row of b.shards || []) {
              const active = row.find((r) => r.isActive);
              if (active) shards.push({ id: active.id, name: active.name });
            }

            result.runes.push({
              id: page.id,
              play: page.play,
              pick_rate: page.pick_rate != null ? round4(page.pick_rate) : null,
              win_rate: (page.win_rate ?? b.win_rate) != null
                ? round4(page.win_rate ?? b.win_rate)
                : (page.win != null && page.play ? round4(page.win / page.play) : null),
              primary_style: {
                id: b.primary_perk_style?.id,
                name: b.primary_perk_style?.name,
              },
              secondary_style: {
                id: b.perk_sub_style?.id,
                name: b.perk_sub_style?.name,
              },
              primary_runes: primaryRunes,
              secondary_runes: secondaryRunes,
              shards: shards,
            });
          }
        } catch {}
      }
    }

    // 2. Summoner Spells from spell chunks / table
    for (const [id, raw] of chunkMap.entries()) {
      if (raw.includes("spells_table_0") || raw.includes("spells_table_1")) {
        const resolved = resolveNode(getParsedChunk(id));
        const str = JSON.stringify(resolved);
        const spellMatches = [
          ...str.matchAll(
            /"metaType":"spell"[^}]*?"metaId":(\d+)[^}]*?(?:"alt":"([^"]+)")?|"metaId":(\d+)[^}]*?"metaType":"spell"[^}]*?(?:"alt":"([^"]+)")?/g
          ),
        ];
        const spellIds = [];
        const spellNames = [];
        for (const sm of spellMatches) {
          const sId = sm[1] || sm[3];
          const sName = sm[2] || sm[4];
          if (sId) {
            const numId = parseInt(sId, 10);
            spellIds.push(numId);
            spellNames.push(getSpellName(numId, sName));
          }
        }
        if (spellIds.length >= 2) {
          const prMatch = str.match(/"tabular-nums","children":"([0-9.]+)%"\}/);
          const wrMatch = str.match(/tabular-nums text-[^"]*","children":"([0-9.]+)%"\}/);
          let games = null;
          const gMatch1 = str.match(/"children":"([0-9,]+) Games"\}/);
          const gMatch2 = str.match(/"children":\["([0-9,]+)","\s*","Games"\]/);
          if (gMatch1) games = parseInt(gMatch1[1].replace(/,/g, ""), 10);
          else if (gMatch2) games = parseInt(gMatch2[1].replace(/,/g, ""), 10);

          result.summoner_spells.push({
            ids: spellIds.slice(0, 2),
            names: spellNames.slice(0, 2),
            pick_rate: prMatch ? round3(parseFloat(prMatch[1]) / 100) : null,
            win_rate: wrMatch ? round3(parseFloat(wrMatch[1]) / 100) : null,
            play: games,
          });
        }
      }
    }

    // 3. Starter items, Boots, Core builds, 4th, 5th, 6th items
    const prefixes = [
      { prefix: "starter_items_", field: "starter_items", max: 2 },
      { prefix: "support_items_", field: "support_items", max: 2 },
      { prefix: "boots_", field: "boots", max: 2 },
      { prefix: "core_items_", field: "core_items", max: 5 },
      { prefix: "depth_4_item_", field: "fourth_items", max: 5 },
      { prefix: "depth_5_item_", field: "fifth_items", max: 5 },
      { prefix: "depth_6_item_", field: "sixth_items", max: 5 },
    ];

    for (const [id, raw] of chunkMap.entries()) {
      if (
        raw.includes("starter_items_") ||
        raw.includes("support_items_") ||
        raw.includes("boots_") ||
        raw.includes("core_items_") ||
        raw.includes("depth_")
      ) {
        const resolved = resolveNode(getParsedChunk(id));
        for (const { prefix, field, max } of prefixes) {
          const rows = findRows(resolved, prefix);
          for (const r of rows) {
            if (result[field].length < max) {
              const parsed = parseRow(r.content);
              if (parsed.ids.length > 0) {
                if (
                  field === "fourth_items" ||
                  field === "fifth_items" ||
                  field === "sixth_items" ||
                  field === "boots"
                ) {
                  result[field].push({
                    id: parsed.ids[0],
                    name: parsed.names[0],
                    pick_rate: parsed.pick_rate,
                    win_rate: parsed.win_rate,
                    play: parsed.play,
                  });
                } else {
                  result[field].push(parsed);
                }
              }
            }
          }
        }
      }
    }

    // 4. Skill Order
    for (const [id, raw] of chunkMap.entries()) {
      if (raw.includes("SkillOrder Table")) {
        const resolved = resolveNode(getParsedChunk(id));
        const str = JSON.stringify(resolved);
        const prioMatches = [...str.matchAll(/"extraData":"([QWER])"/g)].map((m) => m[1]);
        const prio = [];
        for (const p of prioMatches) {
          if (!prio.includes(p)) prio.push(p);
        }

        const prMatch = str.match(/"tabular-nums","children":"([0-9.]+)%"\}/);
        const wrMatch = str.match(/tabular-nums text-[^"]*","children":"([0-9.]+)%"\}/);
        let games = null;
        const gMatch1 = str.match(/"children":"([0-9,]+) Games"\}/);
        const gMatch2 = str.match(/"children":\["([0-9,]+)","\s*","Games"\]/);
        if (gMatch1) games = parseInt(gMatch1[1].replace(/,/g, ""), 10);
        else if (gMatch2) games = parseInt(gMatch2[1].replace(/,/g, ""), 10);

        result.skill_order = {
          priority: prio.slice(0, 3),
          order: null, // enriched via MCP
          pick_rate: prMatch ? round3(parseFloat(prMatch[1]) / 100) : null,
          win_rate: wrMatch ? round3(parseFloat(wrMatch[1]) / 100) : null,
          play: games,
        };
      }
    }

    const hasData =
      result.runes.length > 0 ||
      result.starter_items.length > 0 ||
      result.support_items.length > 0 ||
      result.core_items.length > 0 ||
      result.summoner_spells.length > 0;

    return hasData ? result : null;
  } catch (err) {
    return null;
  }
}

/**
 * Fallback build extractor from MCP lol_get_champion_analysis payload
 */
export function extractMcpBuildFallback(d, dd) {
  if (!d) return null;

  const result = {
    runes: [],
    summoner_spells: [],
    skill_order: null,
    starter_items: [],
    support_items: [],
    boots: [],
    core_items: [],
    fourth_items: [],
    fifth_items: [],
    sixth_items: [],
  };

  if (d.runes?.primary_rune_ids?.length) {
    const r = d.runes;
    result.runes.push({
      id: r.id,
      play: r.play | 0,
      pick_rate: r.pick_rate != null ? round3(r.pick_rate) : null,
      win_rate: r.win != null && r.play ? round3(r.win / r.play) : null,
      primary_style: { id: r.primary_page_id, name: r.primary_page_name },
      secondary_style: { id: r.secondary_page_id, name: r.secondary_page_name },
      primary_runes: (r.primary_rune_ids || []).map((id, i) => ({
        id,
        name: r.primary_rune_names?.[i] || String(id),
      })),
      secondary_runes: (r.secondary_rune_ids || []).map((id, i) => ({
        id,
        name: r.secondary_rune_names?.[i] || String(id),
      })),
      shards: (r.stat_mod_ids || []).map((id, i) => ({
        id,
        name: String(r.stat_mod_names?.[i] || id),
      })),
    });
  }

  if (d.summoner_spells?.ids?.length) {
    const sp = d.summoner_spells;
    result.summoner_spells.push({
      ids: sp.ids,
      names: sp.ids.map((id) => dd.spellsById?.get(id) || String(id)),
      pick_rate: sp.pick_rate != null ? round3(sp.pick_rate) : null,
      win_rate: sp.win != null && sp.play ? round3(sp.win / sp.play) : null,
      play: sp.play | 0,
    });
  }

  if (d.skill_masteries?.ids?.length || d.skills?.order?.length) {
    result.skill_order = {
      priority: d.skill_masteries?.ids || [],
      order: d.skills?.order || null,
      pick_rate: d.skills?.pick_rate != null ? round3(d.skills.pick_rate) : null,
      win_rate: d.skills?.win != null && d.skills?.play ? round3(d.skills.win / d.skills.play) : null,
      play: d.skills?.play | 0,
    };
  }

  if (d.starter_items?.ids?.length) {
    const si = d.starter_items;
    result.starter_items.push({
      ids: si.ids,
      names: si.ids.map((id) => dd.itemsById?.get(id) || String(id)),
      pick_rate: si.pick_rate != null ? round3(si.pick_rate) : null,
      win_rate: si.win != null && si.play ? round3(si.win / si.play) : null,
      play: si.play | 0,
    });
  }

  if (d.boots?.ids?.length) {
    const b = d.boots;
    const bId = b.ids[0];
    result.boots.push({
      id: bId,
      name: dd.itemsById?.get(bId) || b.ids_names?.[0] || `Item ${bId}`,
      pick_rate: b.pick_rate != null ? round3(b.pick_rate) : null,
      win_rate: b.win != null && b.play ? round3(b.win / b.play) : null,
      play: b.play | 0,
    });
  }

  if (d.core_items?.ids?.length) {
    const ci = d.core_items;
    result.core_items.push({
      ids: ci.ids,
      names: ci.ids.map((id) => dd.itemsById?.get(id) || String(id)),
      pick_rate: ci.pick_rate != null ? round3(ci.pick_rate) : null,
      win_rate: ci.win != null && ci.play ? round3(ci.win / ci.play) : null,
      play: ci.play | 0,
    });
  }

  for (const depthField of ["fourth_items", "fifth_items", "sixth_items"]) {
    for (const item of d[depthField] || []) {
      if (item?.ids?.length) {
        const id = item.ids[0];
        result[depthField].push({
          id,
          name: dd.itemsById?.get(id) || item.ids_names?.[0] || `Item ${id}`,
          pick_rate: item.pick_rate != null ? round3(item.pick_rate) : null,
          win_rate: item.win != null && item.play ? round3(item.win / item.play) : null,
          play: item.play | 0,
        });
      }
    }
  }

  const SUPPORT_UPGRADE_IDS = new Set([3869, 3870, 3871, 3876, 3877]);
  for (const item of d.last_items || []) {
    if (item?.ids?.length && SUPPORT_UPGRADE_IDS.has(item.ids[0])) {
      if (result.support_items.length < 2) {
        result.support_items.push({
          ids: item.ids,
          names: item.ids.map((id) => dd?.itemsById?.get(id) || item.ids_names?.[0] || String(id)),
          pick_rate: item.pick_rate != null ? round3(item.pick_rate) : null,
          win_rate: item.win != null && item.play ? round3(item.win / item.play) : null,
          play: item.play | 0,
        });
      }
    }
  }

  const hasData =
    result.runes.length > 0 ||
    result.starter_items.length > 0 ||
    result.support_items.length > 0 ||
    result.core_items.length > 0 ||
    result.summoner_spells.length > 0;

  return hasData ? result : null;
}

/**
 * Mathematically combines two champion datasets into a single weighted dataset.
 */
export function combineChampionDatasets(dataA, dataB) {
  const mapB = new Map((dataB || []).map((c) => [c.champion_id, c]));
  const combined = [];

  for (const cA of dataA || []) {
    const cB = mapB.get(cA.champion_id);
    if (!cB) {
      combined.push(JSON.parse(JSON.stringify(cA)));
      continue;
    }

    const rec = {
      champion_id: cA.champion_id,
      name: cA.name,
      image: cA.image,
      damage: cA.damage || cB.damage,
      frontline: cA.frontline || cB.frontline,
      roles: [...new Set([...(cA.roles || []), ...(cB.roles || [])])],
      stats: {},
    };

    const allPositions = [
      ...new Set([
        ...Object.keys(cA.stats || {}),
        ...Object.keys(cB.stats || {}),
      ]),
    ];

    for (const pos of allPositions) {
      const sA = cA.stats?.[pos];
      const sB = cB.stats?.[pos];

      if (!sA) {
        rec.stats[pos] = JSON.parse(JSON.stringify(sB));
        continue;
      }
      if (!sB) {
        rec.stats[pos] = JSON.parse(JSON.stringify(sA));
        continue;
      }

      const games = (sA.games || 0) + (sB.games || 0);
      const wrA = sA.global_winrate ?? 0.5;
      const wrB = sB.global_winrate ?? 0.5;
      const global_winrate =
        games > 0 ? round4((wrA * sA.games + wrB * sB.games) / games) : wrA;

      // Combine matchups
      const matchups = {};
      const allOpponents = [
        ...new Set([
          ...Object.keys(sA.matchups || {}),
          ...Object.keys(sB.matchups || {}),
        ]),
      ];
      for (const oppId of allOpponents) {
        const mA = sA.matchups?.[oppId];
        const mB = sB.matchups?.[oppId];
        if (!mA) matchups[oppId] = mB;
        else if (!mB) matchups[oppId] = mA;
        else {
          const mGames = (mA.games || 0) + (mB.games || 0);
          const mWr =
            mGames > 0
              ? round4((mA.winrate * mA.games + mB.winrate * mB.games) / mGames)
              : mA.winrate;
          matchups[oppId] = { winrate: mWr, games: mGames };
        }
      }

      // Combine synergies
      const synergies = {};
      const allAllies = [
        ...new Set([
          ...Object.keys(sA.synergies || {}),
          ...Object.keys(sB.synergies || {}),
        ]),
      ];
      for (const allyId of allAllies) {
        const synA = sA.synergies?.[allyId];
        const synB = sB.synergies?.[allyId];
        if (!synA) synergies[allyId] = synB;
        else if (!synB) synergies[allyId] = synA;
        else {
          const sGames = (synA.games || 0) + (synB.games || 0);
          const sWr =
            sGames > 0
              ? round4((synA.winrate * synA.games + synB.winrate * synB.games) / sGames)
              : synA.winrate;
          synergies[allyId] = { winrate: sWr, games: sGames };
        }
      }

      const build = sB.build || sA.build || null;

      rec.stats[pos] = {
        global_winrate,
        games,
        matchups,
        synergies,
        ...(build ? { build } : {}),
      };
    }

    rec.roles.sort(
      (a, b) => (rec.stats[b]?.games || 0) - (rec.stats[a]?.games || 0)
    );
    combined.push(rec);
  }

  return combined;
}

/**
 * Crawls OP.GG champion data directly for an OP.GG recognized tier string.
 */
export async function crawlBaseTier(opggTier = "emerald_plus", options = {}) {
  const {
    concurrency = 6,
    delayMs = 50,
    onProgress = () => {},
    ddragonData = null,
    tierLabel = opggTier,
  } = options;

  const dd = ddragonData || (await loadDataDragon());
  const client = new McpClient();
  await client.initialize();

  const champs = new Map();
  const work = [];

  // 1) Per-position roster via lol_list_lane_meta_champions
  for (const pos of ALL_POSITIONS) {
    const fields = ["champion", "win_rate", "play", "role_rate", "tier"].map(
      (f) => `data.positions.${pos}[].${f}`
    );
    const meta = await client.callTool("lol_list_lane_meta_champions", {
      position: pos,
      desired_output_fields: fields,
    });
    const list = meta?.data?.positions?.[pos] || [];
    for (const row of list) {
      const id = typeof row.champion === "number" ? row.champion : dd.resolve.get(row.champion);
      const meta2 = dd.byId.get(id);
      if (!id || !meta2) continue;

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
      const rec = champs.get(id);
      if (!rec.roles.includes(pos)) rec.roles.push(pos);
      rec.stats[pos] = {
        global_winrate: round3(row.win_rate),
        games: row.play | 0,
        matchups: {},
        synergies: {},
      };
      work.push({ id, role: pos, key: meta2.key, name: meta2.name });
    }
    await sleep(delayMs);
  }

  let completed = 0;
  const total = work.length;
  onProgress({ done: 0, total, tier: tierLabel, status: "fetching_analysis" });

  const analysisFields = [
    "data.damage_type",
    "data.summary.average_stats.play",
    "data.summary.average_stats.win_rate",
    "data.strong_counters[].champion_id", "data.strong_counters[].win_rate", "data.strong_counters[].play",
    "data.weak_counters[].champion_id", "data.weak_counters[].win_rate", "data.weak_counters[].play",
    "data.summary.positions[].name",
    "data.summary.positions[].stats.play",
    "data.summary.positions[].stats.win_rate",
    "data.summary.positions[].stats.role_rate",
    "data.summary.positions[].counters[].champion_id", "data.summary.positions[].counters[].win", "data.summary.positions[].counters[].play",
    "data.runes.{id,pick_rate,play,primary_page_id,primary_page_name,primary_rune_ids[],primary_rune_names[],secondary_page_id,secondary_page_name,secondary_rune_ids[],secondary_rune_names[],stat_mod_ids[],stat_mod_names[],win}",
    "data.summoner_spells.{ids[],ids_names[],pick_rate,play,win}",
    "data.skills.{order[],pick_rate,play,win}",
    "data.skill_masteries.{ids[],pick_rate,play,win}",
    "data.starter_items.{ids[],ids_names[],pick_rate,play,win}",
    "data.boots.{ids[],ids_names[],pick_rate,play,win}",
    "data.core_items.{ids[],ids_names[],pick_rate,play,win}",
    "data.fourth_items[].{ids[],ids_names[],pick_rate,play,win}",
    "data.fifth_items[].{ids[],ids_names[],pick_rate,play,win}",
    "data.sixth_items[].{ids[],ids_names[],pick_rate,play,win}",
  ];

  // 2) Per (champion, role): Bounded concurrent crawl of analysis, HTML counters & synergies
  await asyncPool(concurrency, work, async ({ id, role, key, name }) => {
    const rec = champs.get(id);
    if (!rec) return;

    try {
      // Primary fetch at selected OP.GG tier
      let an = await client.callTool("lol_get_champion_analysis", {
        game_mode: "ranked",
        champion: championArg(key),
        position: role,
        tier: opggTier,
        desired_output_fields: analysisFields,
      });

      // Sample-size gate: fallback to emerald_plus if too thin
      const sampleGames = an?.data?.summary?.average_stats?.play || 0;
      if (sampleGames < MIN_TIER_SAMPLE_GAMES && opggTier !== "emerald_plus" && opggTier !== "all") {
        try {
          const fallback = await client.callTool("lol_get_champion_analysis", {
            game_mode: "ranked",
            champion: championArg(key),
            position: role,
            tier: "emerald_plus",
            desired_output_fields: analysisFields,
          });
          if (fallback?.data) {
            an = fallback;
          }
        } catch {}
      }

      const d = an?.data || {};
      if (d.damage_type) rec.damage = mapDamage(d.damage_type);
      const rs = rec.stats[role];

      // Update games and winrate specifically for this role & tier!
      const posInfo = d.summary?.positions?.find(
        (p) => p.name?.toLowerCase() === role
      );
      if (posInfo?.stats?.play != null) {
        rs.games = posInfo.stats.play | 0;
      } else if (d.summary?.average_stats?.play != null) {
        rs.games = d.summary.average_stats.play | 0;
      }

      if (posInfo?.stats?.win_rate != null) {
        rs.global_winrate = round3(posInfo.stats.win_rate);
      } else if (d.summary?.average_stats?.win_rate != null) {
        rs.global_winrate = round3(d.summary.average_stats.win_rate);
      }

      if (posInfo?.stats?.role_rate != null) {
        rs.role_rate = round3(posInfo.stats.role_rate);
      }

      // Fetch full OP.GG counter matchup table directly (30-60 matchups)
      try {
        const htmlMatchups = await fetchOpggHtmlCounters(key, role, opggTier, dd);
        for (const [oppIdStr, matchData] of Object.entries(htmlMatchups)) {
          rs.matchups[Number(oppIdStr)] = matchData;
        }
      } catch {}

      // Gap-fill strong counters from MCP
      for (const sc of d.strong_counters || []) {
        if (sc?.champion_id != null && rs.matchups[sc.champion_id] == null) {
          rs.matchups[sc.champion_id] = { winrate: round3(sc.win_rate), games: sc.play | 0 };
        }
      }

      // Gap-fill weak counters from MCP (inverted)
      for (const wc of d.weak_counters || []) {
        if (wc?.champion_id != null && rs.matchups[wc.champion_id] == null) {
          rs.matchups[wc.champion_id] = { winrate: round3(1 - wc.win_rate), games: wc.play | 0 };
        }
      }

      // Gap-fill summary counters for matching role
      if (posInfo?.counters) {
        for (const c of posInfo.counters) {
          if (c?.champion_id != null && c.play && rs.matchups[c.champion_id] == null) {
            rs.matchups[c.champion_id] = { winrate: round3((c.win | 0) / c.play), games: c.play | 0 };
          }
        }
      }

      // Dedicated synergies tool for all 5 lanes
      for (const sp of SYNERGY_POSITIONS) {
        if (sp === role) continue;
        try {
          const syn = await client.callTool("lol_get_champion_synergies", {
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
              rs.synergies[s.synergy_champion_id] = { winrate: round4(s.win_rate), games: s.play | 0 };
            }
          }
        } catch {}
        await sleep(delayMs);
      }

      // Fetch rich OP.GG HTML synergy table (with exact 2-decimal winrates)
      try {
        const htmlSynergies = await fetchOpggHtmlSynergies(key, role, opggTier, dd);
        for (const [allyIdStr, synData] of Object.entries(htmlSynergies)) {
          rs.synergies[Number(allyIdStr)] = synData;
        }
      } catch {}

      // Fetch rich OP.GG build data (runes, spells, skills, items)
      try {
        let buildData = await fetchOpggBuildData(key, role, opggTier, dd);

        // Fallback / enrich with MCP analysis data
        if (!buildData) {
          buildData = extractMcpBuildFallback(d, dd);
        } else {
          // Merge full 1-15 level order from MCP if available
          if (d.skills?.order && Array.isArray(d.skills.order)) {
            if (!buildData.skill_order) {
              buildData.skill_order = {};
            }
            buildData.skill_order.order = d.skills.order;
            if (buildData.skill_order.pick_rate == null && d.skills.pick_rate != null) {
              buildData.skill_order.pick_rate = round3(d.skills.pick_rate);
            }
            if (buildData.skill_order.play == null && d.skills.play != null) {
              buildData.skill_order.play = d.skills.play | 0;
            }
            if (buildData.skill_order.win_rate == null && d.skills.win != null && d.skills.play) {
              buildData.skill_order.win_rate = round3(d.skills.win / d.skills.play);
            }
          }
        }

        if (buildData) {
          rs.build = buildData;
        }
      } catch (e) {
        console.warn(`[crawler] Failed build fetch for ${key} (${role}): ${e.message}`);
      }
    } catch (err) {
      console.warn(`[crawler] Failed ${key} (${role}): ${err.message}`);
    }

    completed++;
    onProgress({ done: completed, total, tier: tierLabel, champion: name });
  });

  // 3) Bidirectional matchup cross-linking / symmetrization across all champions in the same lane
  for (const pos of ALL_POSITIONS) {
    const roleChamps = [...champs.values()].filter((c) => c.stats[pos]);
    for (const cA of roleChamps) {
      const matchupsA = cA.stats[pos].matchups;
      for (const [bIdStr, dataA] of Object.entries(matchupsA)) {
        const bId = Number(bIdStr);
        const cB = champs.get(bId);
        if (cB && cB.stats[pos]) {
          const matchupsB = cB.stats[pos].matchups;
          if (matchupsB[cA.champion_id] == null) {
            matchupsB[cA.champion_id] = {
              winrate: round3(1 - dataA.winrate),
              games: dataA.games,
            };
          }
        }
      }
    }
  }

  // 4) Normalize and order roles by game count
  const champions = [...champs.values()].filter((c) => Object.keys(c.stats).length > 0);
  for (const c of champions) {
    c.roles.sort((a, b) => (c.stats[b]?.games || 0) - (c.stats[a]?.games || 0));
  }

  return { patch: dd.version, tier: tierLabel, champions };
}

/**
 * Crawls OP.GG champion data for a tier, synthesizing Plus tiers where appropriate.
 */
export async function crawlTier(tier = "emerald_plus", options = {}) {
  const dataDir = options.dataDir;
  const dd = options.ddragonData || (await loadDataDragon());
  const opts = { ...options, ddragonData: dd };

  if (tier === "iron_plus") {
    const res = await crawlBaseTier("all", { ...opts, tierLabel: "iron_plus" });
    return { ...res, tier: "iron_plus" };
  }

  if (
    tier === "gold_plus" ||
    tier === "platinum_plus" ||
    tier === "emerald_plus" ||
    tier === "diamond_plus"
  ) {
    const res = await crawlBaseTier(tier, { ...opts, tierLabel: tier });
    return { ...res, tier };
  }

  if (tier === "silver_plus") {
    let goldPlusData = null;
    const goldPath = dataDir ? path.join(dataDir, "stats-gold_plus.json") : null;
    if (goldPath) {
      try {
        const raw = await fs.readFile(goldPath, "utf8");
        goldPlusData = JSON.parse(raw);
      } catch {}
    }
    if (!goldPlusData) {
      console.log("[crawler] silver_plus requires gold_plus; crawling gold_plus first...");
      const gRes = await crawlBaseTier("gold_plus", { ...opts, tierLabel: "gold_plus (prerequisite)" });
      if (dataDir) await saveDataset(dataDir, gRes);
      goldPlusData = gRes.champions;
    }

    const sRes = await crawlBaseTier("silver", { ...opts, tierLabel: "silver_plus (silver)" });
    const combined = combineChampionDatasets(sRes.champions, goldPlusData);
    return { patch: sRes.patch, tier: "silver_plus", champions: combined };
  }

  if (tier === "bronze_plus") {
    let silverPlusData = null;
    const silverPath = dataDir ? path.join(dataDir, "stats-silver_plus.json") : null;
    if (silverPath) {
      try {
        const raw = await fs.readFile(silverPath, "utf8");
        silverPlusData = JSON.parse(raw);
      } catch {}
    }
    if (!silverPlusData) {
      console.log("[crawler] bronze_plus requires silver_plus; crawling silver_plus first...");
      const sRes = await crawlTier("silver_plus", opts);
      if (dataDir) await saveDataset(dataDir, sRes);
      silverPlusData = sRes.champions;
    }

    const bRes = await crawlBaseTier("bronze", { ...opts, tierLabel: "bronze_plus (bronze)" });
    const combined = combineChampionDatasets(bRes.champions, silverPlusData);
    return { patch: bRes.patch, tier: "bronze_plus", champions: combined };
  }

  // Fallback for direct or legacy tier names (e.g. 'iron', 'gold', etc.)
  return crawlBaseTier(tier, opts);
}

/**
 * Saves crawled data to disk and updates meta.json.
 */
export async function saveDataset(dataDir, result) {
  const { patch, tier, champions } = result;
  await fs.mkdir(dataDir, { recursive: true });

  const targetPath = path.join(dataDir, `stats-${tier}.json`);
  await fs.writeFile(targetPath, JSON.stringify(champions, null, 2), "utf8");

  // Also maintain default 'stats.json' pointing to emerald_plus as baseline fallback
  if (tier === "emerald_plus") {
    await fs.writeFile(path.join(dataDir, "stats.json"), JSON.stringify(champions, null, 2), "utf8");
  }

  // Update meta.json
  const metaPath = path.join(dataDir, "meta.json");
  let meta = { patch, last_updated: Math.floor(Date.now() / 1000), tiers: {} };
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    meta = JSON.parse(raw);
  } catch {}

  let totalMatchups = 0;
  let totalSynergies = 0;
  let totalBuilds = 0;
  for (const c of champions) {
    for (const s of Object.values(c.stats || {})) {
      totalMatchups += Object.keys(s.matchups || {}).length;
      totalSynergies += Object.keys(s.synergies || {}).length;
      if (s.build) totalBuilds++;
    }
  }

  meta.patch = patch;
  meta.last_updated = Math.floor(Date.now() / 1000);
  if (!meta.tiers) meta.tiers = {};
  meta.tiers[tier] = {
    champions: champions.length,
    matchups: totalMatchups,
    synergies: totalSynergies,
    builds: totalBuilds,
    updated_at: Math.floor(Date.now() / 1000),
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  return { path: targetPath, count: champions.length };
}
