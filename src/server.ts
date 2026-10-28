import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectMongo, disconnectMongo } from "./config/database";
import { redis } from "./config/redis";
import { telegramQueue } from "./workers/queues";

async function main() {
  await connectMongo();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));
  server.keepAliveTimeout = 65_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down...");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await telegramQueue.close().catch(() => undefined);
      await disconnectMongo().catch(() => undefined);
      await redis.quit().catch(() => undefined);
      logger.info("Shutdown complete");
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled rejection"));
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
