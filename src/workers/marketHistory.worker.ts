import { Worker, Queue } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { Token } from "../models/Token";
import { MarketService } from "../services/marketService";
import { logger } from "../config/logger";

export function startMarketHistoryWorker() {
  if (!env.ENABLE_HISTORY_WORKER) return null;
  const queue = new Queue("market-history", { connection: redis });
  const worker = new Worker(
    "market-history",
    async () => {
      const tokens = await Token.find({ published: true }).select("_id").lean();
      for (const t of tokens) await MarketService.refreshHistory(String(t._id));
      return { total: tokens.length };
    },
    { connection: redis, concurrency: 1 }
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "marketHistory failed"));
  queue.add("refresh", {}, { repeat: { every: env.MARKET_HISTORY_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 }).catch((e) => logger.error({ e }, "schedule market history failed"));
  logger.info("Market history worker online");
  return { worker, queue };
}
