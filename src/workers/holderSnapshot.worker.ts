import { Worker, Queue } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { Token } from "../models/Token";
import { HolderService } from "../services/holderService";
import { logger } from "../config/logger";

export function startHolderSnapshotWorker() {
  if (!env.ENABLE_HOLDER_WORKER) return null;
  const queue = new Queue("holder-snapshot", { connection: redis });
  const worker = new Worker(
    "holder-snapshot",
    async () => {
      const mints: string[] = await Token.distinct("mint", { published: true });
      for (const mint of mints) await HolderService.refresh(mint);
      return { total: mints.length };
    },
    { connection: redis, concurrency: 1 }
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "holderSnapshot failed"));
  queue.add("snapshot", {}, { repeat: { every: env.HOLDER_SNAPSHOT_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 }).catch((e) => logger.error({ e }, "schedule holder snapshot failed"));
  logger.info("Holder snapshot worker online");
  return { worker, queue };
}
