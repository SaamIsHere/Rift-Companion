import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api.mjs";
import { CrawlerScheduler } from "./scheduler.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8085;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY) || 6;
const CRON_HOUR = Number(process.env.CRON_HOUR) || 6;

const app = express();

// Trust reverse proxies / Cloudflare Tunnel for accurate client IP tracking
app.set("trust proxy", 1);

app.use(cors());
app.use(compression());
app.use(express.json());

// Rate limit: 120 requests per minute per IP on /api/
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again in a minute." },
});
app.use("/api/", apiLimiter);

app.use(express.static(path.resolve(__dirname, "../public")));

const scheduler = new CrawlerScheduler({
  dataDir: DATA_DIR,
  concurrency: CONCURRENCY,
  scheduledHour: CRON_HOUR,
});

app.use(createApiRouter(scheduler, DATA_DIR));

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`========================================`);
  console.log(`  Rift Server listening on 0.0.0.0:${PORT}`);
  console.log(`  Data directory: ${DATA_DIR}`);
  console.log(`  API Key Auth: ${process.env.RIFT_API_KEY ? "ENABLED" : "DISABLED"}`);
  console.log(`  Admin Auth:   ${process.env.RIFT_ADMIN_KEY ? "ENABLED" : "DISABLED"}`);
  console.log(`========================================`);

  await scheduler.start();
});

const shutdown = () => {
  console.log("\nShutting down Rift Server...");
  scheduler.stop();
  server.close(() => {
    console.log("Server stopped.");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
