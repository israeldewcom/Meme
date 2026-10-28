import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { ApiError } from "../utils/ApiError";
import { ttlToSeconds } from "../utils/ttl";
import { AuthPayload, UserRole } from "../types";

const ISSUER = "meme-launchpad-pro";
const ALG: jwt.Algorithm[] = ["HS256"];

export function signAccessToken(payload: AuthPayload): string {
  const { userId, tenantId, role, wallet } = payload;
  return jwt.sign({ userId, tenantId, role, wallet }, env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: "access",
    expiresIn: ttlToSeconds(env.JWT_ACCESS_TTL)
  });
}

export function signRefreshToken(payload: AuthPayload & { jti: string }): string {
  const { userId, tenantId, role, wallet, jti } = payload;
  return jwt.sign({ userId, tenantId, role, wallet, jti }, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: "refresh",
    expiresIn: ttlToSeconds(env.JWT_REFRESH_TTL)
  });
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ALG, issuer: ISSUER, audience: "access" }) as unknown as AuthPayload;
}

export function verifyRefreshToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ALG, issuer: ISSUER, audience: "refresh" }) as unknown as AuthPayload;
}

export interface WalletChallengeClaims { wallet: string; nonce: string; tenantSlug: string; issuedAt: string; jti: string }

export function signWalletChallengeToken(claims: WalletChallengeClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: ISSUER,
    audience: "wallet-challenge",
    expiresIn: ttlToSeconds(env.JWT_WALLET_CHALLENGE_TTL)
  });
}

export function verifyWalletChallengeToken(token: string): WalletChallengeClaims | null {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ALG, issuer: ISSUER, audience: "wallet-challenge" }) as unknown as WalletChallengeClaims;
  } catch {
    return null;
  }
}

/** Tokens issued before the per-user "cut" timestamp are rejected (ban, role change, logout-all). */
async function authenticate(token: string): Promise<AuthPayload> {
  let payload: AuthPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
  let cut: string | null;
  try {
    cut = await redis.get(`authcut:${payload.userId}`);
  } catch {
    throw ApiError.serviceUnavailable("Auth backend unavailable");
  }
  if (cut && (payload.iat ?? 0) < Number(cut)) throw ApiError.unauthorized("Session revoked");
  return payload;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(ApiError.unauthorized("Missing Bearer token"));
  try {
    req.auth = await authenticate(header.slice(7));
    next();
  } catch (e) {
    next(e);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    req.auth = await authenticate(header.slice(7));
  } catch {
    /* optional: ignore */
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(ApiError.forbidden("Insufficient permissions"));
    next();
  };
}

export const ADMIN_ROLES = {
  edit: ["super_admin", "tenant_admin", "admin", "editor"] as UserRole[],
  moderate: ["super_admin", "tenant_admin", "admin", "moderator"] as UserRole[],
  config: ["super_admin", "tenant_admin", "admin"] as UserRole[],
  analytics: ["super_admin", "tenant_admin", "admin", "analyst"] as UserRole[],
  all: ["super_admin", "tenant_admin", "admin", "editor", "moderator", "analyst"] as UserRole[]
};
