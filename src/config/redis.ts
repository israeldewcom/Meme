import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 5000)
});

redis.on("ready", () => logger.info("Redis ready"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));

export function redisReady(): boolean {
  return redis.status === "ready";
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err }, "cacheSet failed");
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err }, "cacheDel failed");
  }
}

/** Fixed-window counter. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSec + 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
