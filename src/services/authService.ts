import argon2 from "argon2";
import { User } from "../models/User";
import { Tenant } from "../models/Tenant";
import { ReferralLink } from "../models/Referral";
import { ApiError } from "../utils/ApiError";
import { generateReferralCode } from "../utils/crypto";
import { rateLimit } from "../config/redis";
import { SessionService } from "./sessionService";
import { ReferralService } from "./referralService";

let dummyHash: Promise<string> | null = null;

export class AuthService {
  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  static async register(input: {
    email: string; password: string; displayName: string; tenantSlug: string; referralCode?: string; ip?: string;
  }) {
    const tenant = await Tenant.findOne({ slug: input.tenantSlug.toLowerCase(), active: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");

    const email = input.email.toLowerCase();
    if (await User.exists({ email, tenantId: tenant._id })) throw ApiError.conflict("Email already registered in this tenant");

    let referredBy;
    if (input.referralCode && tenant.settings.referralEnabled) {
      const link = await ReferralLink.findOne({ tenantId: tenant._id, code: input.referralCode.toUpperCase() }).lean();
      if (link) referredBy = link.userId;
    }

    const user = await User.create({
      email,
      passwordHash: await this.hashPassword(input.password),
      displayName: input.displayName,
      role: "member",
      tenantId: tenant._id,
      referralCode: generateReferralCode(),
      referredBy,
      lastLoginAt: new Date(),
      lastLoginIp: input.ip
    });
    await ReferralLink.create({ tenantId: tenant._id, userId: user._id, code: user.referralCode });

    if (referredBy) {
      // Conversions are recorded server-side only; clients cannot forge them.
      await ReferralService.recordForReferrer({
        tenantId: String(tenant._id), referrerId: String(referredBy), eventType: "conversion", metadata: { newUserId: String(user._id) }
      }).catch(() => undefined);
    }

    return { user: this.sanitize(user), ...(await this.session(user)) };
  }

  static async login(input: { email: string; password: string; tenantSlug: string; ip?: string }) {
    const tenant = await Tenant.findOne({ slug: input.tenantSlug.toLowerCase(), active: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");

    const email = input.email.toLowerCase();
    const rl = await rateLimit(`login:${tenant.slug}:${email}`, 10, 900);
    if (!rl.allowed) throw ApiError.tooMany("Too many login attempts for this account, try again later.");

    let user = await User.findOne({ email, tenantId: tenant._id });
    if (!user) user = await User.findOne({ email, role: "super_admin", tenantId: null });

    if (!user || !user.passwordHash) {
      const dummy = (dummyHash ??= argon2.hash("dummy-password", { type: argon2.argon2id }));
      await this.verifyPassword(await dummy, input.password); // equalise timing
      throw ApiError.unauthorized("Invalid credentials");
    }
    if (!(await this.verifyPassword(user.passwordHash, input.password))) throw ApiError.unauthorized("Invalid credentials");
    if (user.banned || !user.active) throw ApiError.forbidden("Account is disabled");

    user.lastLoginAt = new Date();
    user.lastLoginIp = input.ip;
    await user.save();
    return { user: this.sanitize(user), ...(await this.session(user)) };
  }

  static session(user: any) {
    return SessionService.issue({
      userId: String(user._id),
      tenantId: user.tenantId ? String(user.tenantId) : null,
      role: user.role,
      wallet: user.wallet
    });
  }

  static sanitize(user: any) {
    return {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
      wallet: user.wallet,
      avatarUrl: user.avatarUrl,
      referralCode: user.referralCode,
      createdAt: user.createdAt
    };
  }
}
