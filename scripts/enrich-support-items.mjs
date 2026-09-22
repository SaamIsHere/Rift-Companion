#!/usr/bin/env node
/**
 * Enrich existing champion datasets (both in APPDATA and server/data if present)
 * with the 2 most common upgraded support items for all champions in the support role.
 */

import fs from "node:fs/promises";
import existsSync from "node:fs";
import path from "node:path";
import { loadDataDragon, fetchOpggBuildData } from "../server/src/crawler.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Loading Data Dragon metadata...");
  const dd = await loadDataDragon();
  console.log(`Loaded Data Dragon v${dd.version}`);

  const customArg = process.argv[2];
  const targetFiles = [];

  if (customArg) {
    const resolvedArg = path.resolve(customArg);
    if (existsSync.existsSync(resolvedArg)) {
      const stat = await fs.stat(resolvedArg);
      if (stat.isDirectory()) {
        const files = await fs.readdir(resolvedArg);
        for (const f of files) {
          if (f.startsWith("stats") && f.endsWith(".json") && !f.endsWith(".meta.json")) {
            targetFiles.push(path.join(resolvedArg, f));
          }
        }
      } else {
        targetFiles.push(resolvedArg);
      }
    }
  }

  if (targetFiles.length === 0) {
    const appDataPath = process.env.APPDATA
      ? path.join(process.env.APPDATA, "com.riftcompanion.app", "stats.json")
      : null;

    const defaultCandidates = [
      appDataPath,
      path.join(process.cwd(), "server", "data", "stats-emerald_plus.json"),
      path.join(process.cwd(), "server", "data", "stats.json"),
    ];

    for (const p of defaultCandidates) {
      if (p && existsSync.existsSync(p)) targetFiles.push(p);
    }
  }

  if (targetFiles.length === 0) {
    console.error("No stats.json files found to enrich.");
    process.exit(1);
  }

  console.log(`Target files to enrich:`, targetFiles);

  // Use the primary file to determine champions
  const primaryRaw = await fs.readFile(targetFiles[0], "utf8");
  const champions = JSON.parse(primaryRaw);

  const supportChamps = champions.filter((c) => c.stats?.support);
  console.log(`Found ${supportChamps.length} support champions.`);

  const supportItemsCache = new Map();

  let count = 0;
  for (const champ of supportChamps) {
    count++;
    const slug = champ.image || champ.name;
    process.stdout.write(`[${count}/${supportChamps.length}] Fetching support items for ${champ.name}... `);

    try {
      const build = await fetchOpggBuildData(slug, "support", "emerald_plus", dd);
      if (build?.support_items && build.support_items.length > 0) {
        supportItemsCache.set(champ.champion_id, build.support_items);
        console.log(`✓ (${build.support_items.map((i) => i.names[0]).join(", ")})`);
      } else {
        console.log("⚠️ No support items found");
      }
    } catch (err) {
      console.log(`✗ Error: ${err.message}`);
    }

    await sleep(200);
  }

  console.log(`Successfully fetched support items for ${supportItemsCache.size} champions.`);

  // Enrich each target file
  for (const file of targetFiles) {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    let updated = 0;

    for (const champ of data) {
      if (champ.stats?.support) {
        const cached = supportItemsCache.get(champ.champion_id);
        if (cached && cached.length > 0) {
          if (!champ.stats.support.build) {
            champ.stats.support.build = {
              runes: [],
              summoner_spells: [],
              skill_order: null,
              starter_items: [],
              support_items: cached,
              boots: [],
              core_items: [],
              fourth_items: [],
              fifth_items: [],
              sixth_items: [],
            };
          } else {
            champ.stats.support.build.support_items = cached;
          }
          updated++;
        }
      }
    }

    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
    console.log(`Updated ${updated} support champions in ${file}`);
  }

  console.log("Enrichment complete!");
}

main().catch(console.error);
