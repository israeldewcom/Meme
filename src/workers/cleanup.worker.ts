import { Worker, Queue } from "bullmq";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { Meme } from "../models/Meme";
import { MemeLike } from "../models/MemeLike";
import { logger } from "../config/logger";

/** TTL indexes handle analytics/audit/referral/history expiry; this removes orphaned likes of removed memes. */
export function startCleanupWorker() {
  if (!env.ENABLE_CLEANUP_WORKER) return null;
  const queue = new Queue("cleanup", { connection: redis });
  const worker = new Worker(
    "cleanup",
    async () => {
      const removed: string[] = (await Meme.find({ status: "removed", updatedAt: { $lt: new Date(Date.now() - 30 * 86400e3) } }).select("_id").limit(500).lean()).map((m) => String(m._id));
      const res = removed.length ? await MemeLike.deleteMany({ memeId: { $in: removed } }) : { deletedCount: 0 };
      return { likesDeleted: res.deletedCount };
    },
    { connection: redis, concurrency: 1 }
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "cleanup failed"));
  queue.add("run", {}, { repeat: { every: env.CLEANUP_INTERVAL_MS }, removeOnComplete: true, removeOnFail: 50 }).catch((e) => logger.error({ e }, "schedule cleanup failed"));
  logger.info("Cleanup worker online");
  return { worker, queue };
}
