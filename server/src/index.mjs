import compression from "compression";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./api.mjs";
import { CrawlerScheduler } from "./scheduler.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY) || 6;
const CRON_HOUR = Number(process.env.CRON_HOUR) || 4;

const app = express();

app.use(cors());
app.use(compression());
app.use(express.json());
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
