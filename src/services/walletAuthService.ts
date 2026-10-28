import { randomUUID } from "crypto";
import { User } from "../models/User";
import { Tenant } from "../models/Tenant";
import { ReferralLink } from "../models/Referral";
import { ApiError } from "../utils/ApiError";
import { generateReferralCode, randomToken } from "../utils/crypto";
import { buildChallengeMessage, verifyWalletSignature } from "../utils/wallet";
import { signWalletChallengeToken, verifyWalletChallengeToken } from "../middleware/auth";
import { isBase58Address } from "../utils/validateAddress";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { ttlToSeconds } from "../utils/ttl";
import { AuthService } from "./authService";

export class WalletAuthService {
  static async issueChallenge(input: { wallet: string; tenantSlug: string }) {
    if (!isBase58Address(input.wallet)) throw ApiError.badRequest("Invalid wallet address");
    const tenant = await Tenant.findOne({ slug: input.tenantSlug.toLowerCase(), active: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");

    const claims = {
      wallet: input.wallet,
      nonce: randomToken(16),
      tenantSlug: tenant.slug,
      issuedAt: new Date().toISOString(),
      jti: randomUUID()
    };
    return {
      message: buildChallengeMessage(claims),
      challengeToken: signWalletChallengeToken(claims),
      expiresIn: env.JWT_WALLET_CHALLENGE_TTL
    };
  }

  static async verifyAndIssue(input: { wallet: string; signature: string; message: string; challengeToken: string; ip?: string }) {
    if (!isBase58Address(input.wallet)) throw ApiError.badRequest("Invalid wallet address");

    const claims = verifyWalletChallengeToken(input.challengeToken);
    if (!claims) throw ApiError.unauthorized("Challenge expired or invalid");
    if (claims.wallet !== input.wallet) throw ApiError.unauthorized("Wallet mismatch");

    // The signed message must be exactly what the server issued (not client-chosen text).
    if (input.message !== buildChallengeMessage(claims)) throw ApiError.unauthorized("Message does not match challenge");
    if (!verifyWalletSignature({ message: input.message, signature: input.signature, wallet: input.wallet })) {
      throw ApiError.unauthorized("Signature verification failed");
    }

    // One-time use: reject replays within the TTL window.
    const consumed = await redis.set(`wc:${claims.jti}`, "1", "EX", ttlToSeconds(env.JWT_WALLET_CHALLENGE_TTL) + 30, "NX");
    if (consumed !== "OK") throw ApiError.unauthorized("Challenge already used");

    const tenant = await Tenant.findOne({ slug: claims.tenantSlug.toLowerCase(), active: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");

    let user = await User.findOne({ wallet: input.wallet, tenantId: tenant._id });
    if (!user) {
      user = await User.create({
        wallet: input.wallet,
        displayName: `${input.wallet.slice(0, 4)}…${input.wallet.slice(-4)}`,
        role: "member",
        tenantId: tenant._id,
        referralCode: generateReferralCode(),
        lastLoginAt: new Date(),
        lastLoginIp: input.ip
      });
      await ReferralLink.create({ tenantId: tenant._id, userId: user._id, code: user.referralCode });
    } else {
      if (user.banned || !user.active) throw ApiError.forbidden("Account is disabled");
      user.lastLoginAt = new Date();
      user.lastLoginIp = input.ip;
      await user.save();
    }

    return {
      user: { id: String(user._id), wallet: user.wallet, displayName: user.displayName, role: user.role, referralCode: user.referralCode },
      ...(await AuthService.session(user))
    };
  }
}
