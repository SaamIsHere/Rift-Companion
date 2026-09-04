import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crawlTier,
  fetchLatestDdragonVersion,
  loadDataDragon,
  saveDataset,
  SUPPORTED_TIERS,
} from "./crawler.mjs";

const MAX_AGE_SECS = 24 * 3600; // 24 hours

export class CrawlerScheduler {
  constructor(options = {}) {
    this.dataDir = options.dataDir || "/data";
    this.concurrency = options.concurrency || 6;
    this.checkIntervalMs = options.checkIntervalMs || 60 * 60 * 1000; // hourly check
    this.scheduledHour = options.scheduledHour ?? 4; // 04:00 AM

    this.isCrawling = false;
    this.currentProgress = null;
    this.timer = null;
  }

  getStatus() {
    return {
      crawling: this.isCrawling,
      progress: this.currentProgress,
    };
  }

  async readMeta() {
    try {
      const raw = await fs.readFile(path.join(this.dataDir, "meta.json"), "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async start() {
    console.log(`[scheduler] Starting scheduler (Data dir: ${this.dataDir}, Concurrency: ${this.concurrency})`);
    await fs.mkdir(this.dataDir, { recursive: true });

    // Seed fallback dataset if no stats.json exists yet so API is instantly operational
    const statsPath = path.join(this.dataDir, "stats.json");
    try {
      await fs.access(statsPath);
    } catch {
      const seedFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "seed.json");
      try {
        await fs.copyFile(seedFile, statsPath);
        await fs.copyFile(seedFile, path.join(this.dataDir, "stats-emerald_plus.json"));
        console.log("[scheduler] Initialized server/data with baseline seed data.");
      } catch (err) {
        console.warn("[scheduler] Could not copy seed data:", err.message);
      }
    }

    // Initial check: if no stats file exists, run crawl immediately
    const meta = await this.readMeta();
    if (!meta || !meta.tiers || Object.keys(meta.tiers).length === 0) {
      console.log("[scheduler] No existing datasets found in meta.json. Triggering initial crawl for emerald_plus...");
      this.triggerCrawl(["emerald_plus"]).catch((err) => {
        console.error("[scheduler] Initial crawl failed:", err);
      });
    }

    // Start periodic check timer
    this.timer = setInterval(() => this.check(), this.checkIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async check() {
    if (this.isCrawling) return;

    try {
      const meta = await this.readMeta();
      const currentPatch = await fetchLatestDdragonVersion();

      const nowSecs = Math.floor(Date.now() / 1000);
      const isStalePatch = !meta || meta.patch !== currentPatch;
      const isExpired = !meta || nowSecs - meta.last_updated >= MAX_AGE_SECS;

      const currentHour = new Date().getHours();
      const isDailyWindow = currentHour === this.scheduledHour;

      if (isStalePatch || (isExpired && isDailyWindow)) {
        console.log(
          `[scheduler] Triggering scheduled crawl (new patch: ${isStalePatch}, expired: ${isExpired})`
        );
        await this.triggerCrawl(SUPPORTED_TIERS);
      }
    } catch (err) {
      console.error("[scheduler] Periodic check failed:", err.message);
    }
  }

  async triggerCrawl(tiers = ["emerald_plus"]) {
    if (this.isCrawling) {
      throw new Error("A crawl is already in progress");
    }

    this.isCrawling = true;
    const targetTiers = Array.isArray(tiers) ? tiers : [tiers];

    (async () => {
      try {
        console.log(`[scheduler] Beginning crawl for tiers: ${targetTiers.join(", ")}`);
        const dd = await loadDataDragon();

        for (const tier of targetTiers) {
          console.log(`[scheduler] Starting crawl for rank tier '${tier}'...`);
          this.currentProgress = {
            tier,
            done: 0,
            total: 0,
            champion: "Initializing...",
          };

          const result = await crawlTier(tier, {
            concurrency: this.concurrency,
            dataDir: this.dataDir,
            ddragonData: dd,
            onProgress: (prog) => {
              this.currentProgress = {
                tier: prog.tier,
                done: prog.done,
                total: prog.total,
                champion: prog.champion,
              };
            },
          });

          await saveDataset(this.dataDir, result);
          console.log(`[scheduler] Completed and saved '${tier}' (${result.champions.length} champions).`);
        }
        console.log("[scheduler] All requested tiers successfully crawled.");
      } catch (err) {
        console.error("[scheduler] Crawl failed:", err);
      } finally {
        this.isCrawling = false;
        this.currentProgress = null;
      }
    })();

    return { status: "started", tiers: targetTiers };
  }
}
