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
const round3 = (x) => Math.round(x * 1000) / 1000;
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
  return { version, byId, resolve, norm };
}

/**
 * Fetches the full counter matchup table directly from OP.GG's webpage
 * (which renders 30-60 matchups per champion & position).
 */
export async function fetchOpggHtmlCounters(championKey, role, tier, dd) {
  const slug = championKey.toLowerCase();
  const url = `https://www.op.gg/champions/${slug}/counters/${role}?tier=${tier}`;
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
          const wr = round3(parseFloat(wrMatch[1]) / 100);
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
        games > 0 ? round3((wrA * sA.games + wrB * sB.games) / games) : wrA;

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
              ? round3((mA.winrate * mA.games + mB.winrate * mB.games) / mGames)
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
              ? round3((synA.winrate * synA.games + synB.winrate * synB.games) / sGames)
              : synA.winrate;
          synergies[allyId] = { winrate: sWr, games: sGames };
        }
      }

      rec.stats[pos] = {
        global_winrate,
        games,
        matchups,
        synergies,
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
              rs.synergies[s.synergy_champion_id] = { winrate: round3(s.win_rate), games: s.play | 0 };
            }
          }
        } catch {}
        await sleep(delayMs);
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
  for (const c of champions) {
    for (const s of Object.values(c.stats || {})) {
      totalMatchups += Object.keys(s.matchups || {}).length;
      totalSynergies += Object.keys(s.synergies || {}).length;
    }
  }

  meta.patch = patch;
  meta.last_updated = Math.floor(Date.now() / 1000);
  if (!meta.tiers) meta.tiers = {};
  meta.tiers[tier] = {
    champions: champions.length,
    matchups: totalMatchups,
    synergies: totalSynergies,
    updated_at: Math.floor(Date.now() / 1000),
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  return { path: targetPath, count: champions.length };
}
