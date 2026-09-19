import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { SUPPORTED_TIERS } from "./crawler.mjs";

function normalizeTier(tier) {
  if (!tier) return "emerald_plus";
  const t = String(tier).toLowerCase();
  switch (t) {
    case "iron":
      return "iron_plus";
    case "bronze":
      return "bronze_plus";
    case "silver":
      return "silver_plus";
    case "gold":
      return "gold_plus";
    case "platinum":
    case "platin":
      return "platinum_plus";
    case "emerald":
      return "emerald_plus";
    case "diamond":
      return "diamond_plus";
    default:
      return t;
  }
}

export function createApiRouter(scheduler, dataDir) {
  const router = express.Router();

  const apiKey = process.env.RIFT_API_KEY ? String(process.env.RIFT_API_KEY).trim() : null;
  const adminKey = process.env.RIFT_ADMIN_KEY ? String(process.env.RIFT_ADMIN_KEY).trim() : apiKey;

  // Middleware: verify pre-shared API key for all /api data routes
  const requireApiKey = (req, res, next) => {
    if (!apiKey) return next();

    const clientKey = req.headers["x-rift-key"] || req.headers["x-admin-key"] || req.query.key;
    if (!clientKey || (clientKey !== apiKey && clientKey !== adminKey)) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing X-Rift-Key header" });
    }
    next();
  };

  // Middleware: verify admin key for crawler control routes
  const requireAdminKey = (req, res, next) => {
    if (!adminKey) return next();

    const clientKey = req.headers["x-admin-key"] || req.headers["x-rift-key"] || req.query.key;
    if (!clientKey || clientKey !== adminKey) {
      return res.status(403).json({ error: "Forbidden: Admin access required for crawler operations" });
    }
    next();
  };

  // Health check - always public
  router.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Protect all /api endpoints with API key
  router.use("/api", requireApiKey);

  // Overall server and crawler status
  router.get("/api/status", async (req, res) => {
    try {
      const meta = await scheduler.readMeta();
      const crawlerStatus = scheduler.getStatus();

      res.json({
        patch: meta?.patch || null,
        last_updated: meta?.last_updated || null,
        crawling: crawlerStatus.crawling,
        crawl_progress: crawlerStatus.progress,
        tiers: meta?.tiers || {},
        supported_tiers: SUPPORTED_TIERS,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch champion stats for a specific tier
  router.get("/api/stats", async (req, res) => {
    const tier = normalizeTier(req.query.tier);

    let targetFile = path.join(dataDir, `stats-${tier}.json`);
    if (!fs.existsSync(targetFile)) {
      const legacyFile = path.join(dataDir, `stats-${req.query.tier}.json`);
      if (req.query.tier && fs.existsSync(legacyFile)) {
        targetFile = legacyFile;
      } else {
        const fallback = path.join(dataDir, "stats.json");
        if (fs.existsSync(fallback)) {
          targetFile = fallback;
        } else {
          return res.status(404).json({
            error: `No dataset available for tier '${tier}' yet. A crawl may be in progress.`,
            crawling: scheduler.getStatus().crawling,
          });
        }
      }
    }

    res.setHeader("Content-Type", "application/json");
    const stream = fs.createReadStream(targetFile);
    stream.pipe(res);
  });

  // Fetch build recommendations for a specific champion and role
  router.get("/api/build", async (req, res) => {
    const champQuery = (req.query.champion || "").toLowerCase().trim();
    const roleQuery = (req.query.role || "").toLowerCase().trim();
    const tier = normalizeTier(req.query.tier);

    if (!champQuery || !roleQuery) {
      return res.status(400).json({ error: "Missing champion or role query parameter" });
    }

    let targetFile = path.join(dataDir, `stats-${tier}.json`);
    if (!fs.existsSync(targetFile)) {
      const legacyFile = path.join(dataDir, `stats-${req.query.tier}.json`);
      if (req.query.tier && fs.existsSync(legacyFile)) {
        targetFile = legacyFile;
      } else {
        const fallback = path.join(dataDir, "stats.json");
        if (fs.existsSync(fallback)) targetFile = fallback;
        else return res.status(404).json({ error: `No dataset available for tier '${tier}'` });
      }
    }

    try {
      const raw = await fsp.readFile(targetFile, "utf8");
      const champions = JSON.parse(raw);
      const champ = champions.find(
        (c) =>
          c.name.toLowerCase() === champQuery ||
          c.image.toLowerCase() === champQuery ||
          String(c.champion_id) === champQuery
      );

      if (!champ) {
        return res.status(404).json({ error: `Champion '${champQuery}' not found` });
      }

      const roleStats = champ.stats?.[roleQuery];
      if (!roleStats) {
        return res.status(404).json({ error: `No stats found for '${champ.name}' in role '${roleQuery}'` });
      }

      res.json({
        champion_id: champ.champion_id,
        name: champ.name,
        role: roleQuery,
        tier: tier,
        global_winrate: roleStats.global_winrate,
        games: roleStats.games,
        build: roleStats.build || null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manually trigger a refresh (Admin only)
  router.post("/api/refresh", requireAdminKey, async (req, res) => {
    const requestedTier = req.query.tier || req.body?.tier || "emerald_plus";
    const tiers = requestedTier === "all" ? SUPPORTED_TIERS : [normalizeTier(requestedTier)];

    try {
      const result = await scheduler.triggerCrawl(tiers);
      res.json({
        message: "Crawl started successfully",
        tiers: result.tiers,
      });
    } catch (err) {
      if (err.message.includes("already in progress")) {
        return res.status(409).json({ error: err.message, status: scheduler.getStatus() });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Champion list summary for the dashboard (per-role breakdown)
  router.get("/api/champions", async (req, res) => {
    const tier = normalizeTier(req.query.tier);
    const roleFilter = req.query.role;
    let targetFile = path.join(dataDir, `stats-${tier}.json`);
    if (!fs.existsSync(targetFile)) {
      const legacyFile = path.join(dataDir, `stats-${req.query.tier}.json`);
      if (req.query.tier && fs.existsSync(legacyFile)) {
        targetFile = legacyFile;
      } else {
        targetFile = path.join(dataDir, "stats.json");
      }
    }
    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: "No champion data found" });
    }
    try {
      const raw = await fsp.readFile(targetFile, "utf8");
      const champions = JSON.parse(raw);
      const list = [];

      for (const c of champions) {
        const roles = c.roles?.length ? c.roles : Object.keys(c.stats || {});
        let totalChampGames = 0;
        for (const r of roles) {
          totalChampGames += c.stats?.[r]?.games || 0;
        }

        for (const r of roles) {
          if (roleFilter && roleFilter !== "all" && r !== roleFilter) continue;
          const st = c.stats?.[r];
          if (!st) continue;

          const roleGames = st.games || 0;
          let roleRate = st.role_rate;
          if (roleRate == null) {
            roleRate = totalChampGames > 0 ? roleGames / totalChampGames : 1;
          }

          list.push({
            id: c.champion_id,
            name: c.name,
            image: c.image,
            damage: c.damage,
            frontline: c.frontline,
            role: r,
            role_rate: Math.round(roleRate * 1000) / 1000,
            roles: roles,
            winrate: st.global_winrate ?? null,
            games: roleGames,
            matchup_count: Object.keys(st.matchups || {}).length,
            synergy_count: Object.keys(st.synergies || {}).length,
            has_build: !!st.build,
          });
        }
      }

      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manually check Data Dragon for a new patch (Admin only)
  router.post("/api/check-patch", requireAdminKey, async (req, res) => {
    try {
      await scheduler.check();
      res.json({ message: "Patch check executed", status: scheduler.getStatus() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
