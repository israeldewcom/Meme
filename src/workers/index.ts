import { connectMongo, disconnectMongo } from "../config/database";
import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { startPriceRefreshWorker } from "./priceRefresh.worker";
import { startHolderSnapshotWorker } from "./holderSnapshot.worker";
import { startMarketHistoryWorker } from "./marketHistory.worker";
import { startTelegramWorker } from "./telegram.worker";
import { startCleanupWorker } from "./cleanup.worker";

async function bootstrap() {
  await connectMongo();
  const started = [startPriceRefreshWorker(), startHolderSnapshotWorker(), startMarketHistoryWorker(), startTelegramWorker(), startCleanupWorker()].filter(Boolean) as Array<{
    worker: { close(): Promise<void> };
    queue?: { close(): Promise<void> };
  }>;
  logger.info({ workers: started.length }, "Workers started");

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    logger.info("Shutting down workers...");
    setTimeout(() => process.exit(1), 15_000).unref();
    await Promise.all(started.map((s) => s.worker.close().catch(() => undefined)));
    await Promise.all(started.map((s) => s.queue?.close().catch(() => undefined)));
    await disconnectMongo().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled rejection"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "Worker bootstrap failed");
  process.exit(1);
});
