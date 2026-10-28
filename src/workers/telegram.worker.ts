import { Worker, Job } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { TelegramService } from "../services/telegramService";
import { TelegramJob } from "./queues";
import { logger } from "../config/logger";

export function startTelegramWorker() {
  if (!env.ENABLE_TELEGRAM_WORKER || !TelegramService.enabled) {
    logger.info("Telegram worker disabled or missing token");
    return null;
  }
  const worker = new Worker<TelegramJob>(
    "telegram",
    async (job: Job<TelegramJob>) => {
      const { chatId, title, body, tenantName } = job.data;
      return TelegramService.sendMessage(chatId, TelegramService.formatAnnouncement(title, body, tenantName));
    },
    { connection: redis, concurrency: 2 }
  );
  worker.on("failed", (job, err) => logger.warn({ jobId: job?.id, msg: err.message }, "telegram job failed"));
  logger.info("Telegram worker online");
  return { worker };
}
