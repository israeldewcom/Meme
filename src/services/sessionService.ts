import { randomUUID } from "crypto";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { User } from "../models/User";
import { Tenant } from "../models/Tenant";
import { ApiError } from "../utils/ApiError";
import { ttlToSeconds } from "../utils/ttl";
import { AuthPayload } from "../types";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../middleware/auth";

type Identity = Omit<AuthPayload, "jti" | "iat">;

export class SessionService {
  /** Issue an access + refresh pair; the refresh jti is allow-listed in Redis. */
  static async issue(identity: Identity) {
    const jti = randomUUID();
    const ttl = ttlToSeconds(env.JWT_REFRESH_TTL);
    await redis.set(`rt:${jti}`, identity.userId, "EX", ttl);
    await redis.sadd(`rtu:${identity.userId}`, jti);
    await redis.expire(`rtu:${identity.userId}`, ttl);
    return {
      accessToken: signAccessToken(identity),
      refreshToken: signRefreshToken({ ...identity, jti })
    };
  }

  /** Rotate: a refresh token works exactly once. Reuse revokes every session of the user. */
  static async rotate(refreshToken: string) {
    let p: AuthPayload;
    try {
      p = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized("Invalid refresh token");
    }
    if (!p.jti) throw ApiError.unauthorized("Invalid refresh token");

    const owner = await redis.getdel(`rt:${p.jti}`);
    if (owner !== p.userId) {
      await this.revokeAll(p.userId);
      throw ApiError.unauthorized("Refresh token reuse detected; all sessions revoked");
    }
    await redis.srem(`rtu:${p.userId}`, p.jti);

    const user = await User.findById(p.userId);
    if (!user || !user.active || user.banned) throw ApiError.unauthorized("User invalid");
    if (user.tenantId) {
      const t = await Tenant.findOne({ _id: user.tenantId, active: true }).select("_id").lean();
      if (!t) throw ApiError.unauthorized("Tenant inactive");
    }
    return this.issue({
      userId: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      wallet: user.wallet
    });
  }

  static async revoke(refreshToken: string) {
    try {
      const p = verifyRefreshToken(refreshToken);
      if (p.jti) {
        await redis.del(`rt:${p.jti}`);
        await redis.srem(`rtu:${p.userId}`, p.jti);
      }
    } catch {
      /* already invalid: nothing to revoke */
    }
  }

  /** Invalidate every refresh token and every access token issued before now. */
  static async revokeAll(userId: string) {
    await redis.set(`authcut:${userId}`, String(Math.floor(Date.now() / 1000)), "EX", 24 * 3600);
    const jtis = await redis.smembers(`rtu:${userId}`);
    if (jtis.length) await redis.del(...jtis.map((j) => `rt:${j}`));
    await redis.del(`rtu:${userId}`);
  }
}
