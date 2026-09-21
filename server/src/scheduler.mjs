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

const SCHEDULE_FILE = "schedule.json";

export class CrawlerScheduler {
  constructor(options = {}) {
    this.dataDir = options.dataDir || "/data";
    this.concurrency = options.concurrency || 6;
    // Check every 30 seconds so we accurately catch the scheduled hour/minute window
    this.checkIntervalMs = options.checkIntervalMs || 30 * 1000;
    this.scheduledHour = options.scheduledHour ?? 6; // Default: 06:00 AM

    this.isCrawling = false;
    this.currentProgress = null;
    this.timer = null;

    this.config = {
      enabled: true,
      hour: this.scheduledHour,
      minute: 0,
      lastRunDate: null,
      lastRunTime: null,
      lastRunStatus: null,
    };
  }

  async loadConfig() {
    const configPath = path.join(this.dataDir, SCHEDULE_FILE);
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw);
      this.config = {
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
        hour: parsed.hour !== undefined ? Number(parsed.hour) : this.scheduledHour,
        minute: parsed.minute !== undefined ? Number(parsed.minute) : 0,
        lastRunDate: parsed.lastRunDate || null,
        lastRunTime: parsed.lastRunTime || null,
        lastRunStatus: parsed.lastRunStatus || null,
      };
      console.log(
        `[scheduler] Loaded schedule config: enabled=${this.config.enabled}, time=${String(this.config.hour).padStart(2, "0")}:${String(this.config.minute).padStart(2, "0")}`
      );
    } catch {
      // Create initial schedule.json
      console.log(`[scheduler] No schedule config found. Initializing default at ${String(this.scheduledHour).padStart(2, "0")}:00...`);
      await this.saveConfig();
    }
  }

  async saveConfig() {
    const configPath = path.join(this.dataDir, SCHEDULE_FILE);
    try {
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2), "utf8");
    } catch (err) {
      console.error("[scheduler] Failed to save schedule config:", err.message);
    }
  }

  getSchedule() {
    const now = new Date();
    const enabled = Boolean(this.config.enabled);
    const hour = Number(this.config.hour) ?? 6;
    const minute = Number(this.config.minute) ?? 0;

    let nextRun = null;
    if (enabled) {
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      if (now >= target || this.config.lastRunDate === todayStr) {
        target.setDate(target.getDate() + 1);
      }
      nextRun = target.toISOString();
    }

    return {
      enabled,
      hour,
      minute,
      lastRunDate: this.config.lastRunDate || null,
      lastRunTime: this.config.lastRunTime || null,
      lastRunStatus: this.config.lastRunStatus || null,
      nextRun,
    };
  }

  async updateSchedule(newSettings = {}) {
    let { enabled, hour, minute } = newSettings;

    if (hour === "disabled" || hour === -1 || hour === "-1") {
      enabled = false;
    } else if (enabled !== undefined) {
      this.config.enabled = Boolean(enabled);
    }

    if (hour !== undefined && hour !== "disabled" && hour !== -1 && hour !== "-1") {
      const h = parseInt(hour, 10);
      if (!isNaN(h) && h >= 0 && h <= 23) {
        this.config.hour = h;
      }
    }

    if (minute !== undefined) {
      const m = parseInt(minute, 10);
      if (!isNaN(m) && m >= 0 && m <= 59) {
        this.config.minute = m;
      }
    }

    await this.saveConfig();
    console.log(
      `[scheduler] Schedule updated: enabled=${this.config.enabled}, hour=${String(this.config.hour).padStart(2, "0")}:${String(this.config.minute).padStart(2, "0")}`
    );
    return this.getSchedule();
  }

  getStatus() {
    return {
      crawling: this.isCrawling,
      progress: this.currentProgress,
      schedule: this.getSchedule(),
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

    // Load or initialize schedule config
    await this.loadConfig();

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

    // Start periodic check timer (checks every 30 seconds)
    this.timer = setInterval(() => this.check(), this.checkIntervalMs);
    console.log(
      `[scheduler] Daily auto-crawl schedule active: ${
        this.config.enabled
          ? `Enabled at ${String(this.config.hour).padStart(2, "0")}:${String(this.config.minute).padStart(2, "0")}`
          : "Disabled"
      }`
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async check() {
    if (this.isCrawling) return;

    // 1. Check for stale patch (new League patch released by Riot)
    try {
      const meta = await this.readMeta();
      const currentPatch = await fetchLatestDdragonVersion();
      const isStalePatch = meta?.patch && meta.patch !== currentPatch;

      if (isStalePatch) {
        console.log(`[scheduler] New League patch detected (${currentPatch} vs ${meta.patch}). Triggering sync for all tiers...`);
        await this.triggerCrawl(SUPPORTED_TIERS, false);
        return;
      }
    } catch (err) {
      // Ignore patch fetch failures on intermittent network errors
    }

    // 2. Check for daily scheduled crawl
    if (!this.config.enabled) return;

    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const todayStr = `${year}-${month}-${day}`;

      // If already ran today, skip
      if (this.config.lastRunDate === todayStr) {
        return;
      }

      const targetHour = Number(this.config.hour) ?? 6;
      const targetMinute = Number(this.config.minute) ?? 0;

      // Trigger if we are within the target hour window and minute has elapsed
      if (currentHour === targetHour && currentMinute >= targetMinute) {
        console.log(
          `[scheduler] Scheduled daily crawl triggered at ${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")} (target: ${String(targetHour).padStart(2, "0")}:${String(targetMinute).padStart(2, "0")}) for all tiers.`
        );

        this.config.lastRunDate = todayStr;
        this.config.lastRunTime = Math.floor(Date.now() / 1000);
        this.config.lastRunStatus = "running";
        await this.saveConfig();

        await this.triggerCrawl(SUPPORTED_TIERS, true);
      }
    } catch (err) {
      console.error("[scheduler] Daily check failed:", err.message);
    }
  }

  async triggerCrawl(tiers = ["emerald_plus"], isDaily = false) {
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

        if (isDaily || targetTiers.length === SUPPORTED_TIERS.length) {
          this.config.lastRunStatus = "success";
          this.config.lastRunTime = Math.floor(Date.now() / 1000);
          await this.saveConfig();
        }
      } catch (err) {
        console.error("[scheduler] Crawl failed:", err);
        if (isDaily || targetTiers.length === SUPPORTED_TIERS.length) {
          this.config.lastRunStatus = `error: ${err.message}`;
          await this.saveConfig();
        }
      } finally {
        this.isCrawling = false;
        this.currentProgress = null;
      }
    })();

    return { status: "started", tiers: targetTiers };
  }
}
