import { Worker, Queue } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { Token } from "../models/Token";
import { MarketService } from "../services/marketService";
import { logger } from "../config/logger";

export function startPriceRefreshWorker() {
  if (!env.ENABLE_PRICE_WORKER) return null;
  const queue = new Queue("price-refresh", { connection: redis });
  const worker = new Worker(
    "price-refresh",
    async () => {
      const tokens = await Token.find({ published: true }).select("_id").lean();
      for (const t of tokens) await MarketService.refreshTokenData(String(t._id));
      return { total: tokens.length };
    },
    { connection: redis, concurrency: 1 }
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "priceRefresh failed"));
  queue.add("refresh", {}, { repeat: { every: env.PRICE_REFRESH_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 }).catch((e) => logger.error({ e }, "schedule price refresh failed"));
  logger.info("Price refresh worker online");
  return { worker, queue };
}
