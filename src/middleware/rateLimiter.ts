import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { ApiError } from "../utils/ApiError";

function make(prefix: string, windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Redis-backed so limits hold across multiple API instances.
    store: new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<any>
    }),
    // Errors thrown inside this handler never reach Express: forward via next().
    handler: (_req, _res, next) => next(ApiError.tooMany(message))
  });
}

export const apiLimiter = make("api", env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX, "Too many requests, slow down.");
export const authLimiter = make("auth", 15 * 60 * 1000, env.AUTH_RATE_LIMIT_MAX, "Too many authentication attempts, try again later.");
export const referralTrackLimiter = make("ref", 60 * 1000, env.REFERRAL_TRACK_MAX, "Too many referral tracking events.");
export const uploadLimiter = make("upload", 5 * 60 * 1000, 20, "Upload rate limit exceeded.");
export const analyticsLimiter = make("analytics", 60 * 1000, 60, "Too many analytics events.");
export const reportLimiter = make("report", 10 * 60 * 1000, 20, "Too many reports.");
