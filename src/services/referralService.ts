import { Types } from "mongoose";
import { ReferralEvent, ReferralLink, ReferralEventType } from "../models/Referral";
import { User } from "../models/User";
import { AuditLog } from "../models/AuditLog";
import { ApiError } from "../utils/ApiError";
import { generateReferralCode, ipHash } from "../utils/crypto";
import { FrontendReferralStats } from "../types";
import { env } from "../config/env";

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export class ReferralService {
  static async getOrCreateLink(userId: string, tenantId: string, baseUrl: string) {
    let link = await ReferralLink.findOne({ userId, tenantId });
    if (!link) {
      const user = await User.findById(userId);
      if (!user) throw ApiError.notFound("User not found");
      if (!user.referralCode) {
        user.referralCode = generateReferralCode();
        await user.save();
      }
      link = await ReferralLink.create({ tenantId, userId, code: user.referralCode });
    }
    return { code: link.code, link: `${baseUrl.replace(/\/$/, "")}/?ref=${link.code}`, campaign: link.campaign };
  }

  /** Public, client-triggered events. Only low-trust types are allowed here. */
  static async trackPublicEvent(input: {
    tenantId: string; code: string; eventType: "visit" | "share"; ip: string; userAgent?: string; referrer?: string; campaign?: string;
  }) {
    const code = input.code.toUpperCase();
    const link = await ReferralLink.findOne({ tenantId: input.tenantId, code }).lean();
    if (!link) throw ApiError.notFound("Referral code not found");

    const hashedIp = ipHash(input.ip, env.JWT_SECRET);
    const recent = await ReferralEvent.exists({
      tenantId: input.tenantId, code, eventType: input.eventType, ipHash: hashedIp,
      createdAt: { $gte: new Date(Date.now() - 60_000) }
    });
    if (recent) return { deduped: true };

    await ReferralEvent.create({
      tenantId: input.tenantId, referrerId: link.userId, code, eventType: input.eventType, ipHash: hashedIp,
      userAgent: input.userAgent?.slice(0, 400), referrer: input.referrer?.slice(0, 400),
      qualified: false, metadata: { campaign: input.campaign }
    });
    return { ok: true };
  }

  /** Trusted, server-side events (conversion on signup, qualified on first approved activity). */
  static async recordForReferrer(input: {
    tenantId: string; referrerId: string; eventType: ReferralEventType; metadata?: Record<string, unknown>;
  }) {
    const link = await ReferralLink.findOne({ tenantId: input.tenantId, userId: input.referrerId }).lean();
    if (!link) return;
    await ReferralEvent.create({
      tenantId: input.tenantId, referrerId: input.referrerId, code: link.code, eventType: input.eventType,
      ipHash: "server", qualified: input.eventType === "qualified" || input.eventType === "conversion", metadata: input.metadata
    });
  }

  static async getStats(userId: string, tenantId: string): Promise<FrontendReferralStats> {
    const uid = new Types.ObjectId(userId);
    const tid = new Types.ObjectId(tenantId);
    const base = { referrerId: uid, tenantId: tid };

    const [link, visits, uniqueIps, qualified, conversions, shares, best, recent] = await Promise.all([
      ReferralLink.findOne({ userId: uid, tenantId: tid }).lean(),
      ReferralEvent.countDocuments({ ...base, eventType: "visit" }),
      ReferralEvent.distinct("ipHash", { ...base, eventType: "visit" }),
      ReferralEvent.countDocuments({ ...base, eventType: "qualified" }),
      ReferralEvent.countDocuments({ ...base, eventType: "conversion" }),
      ReferralEvent.countDocuments({ ...base, eventType: "share" }),
      ReferralEvent.aggregate([
        { $match: { ...base, eventType: "visit", "metadata.campaign": { $type: "string" } } },
        { $group: { _id: "$metadata.campaign", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]),
      ReferralEvent.find(base).sort({ createdAt: -1 }).limit(8).lean()
    ]);

    return {
      visits,
      uniqueVisitors: uniqueIps.length,
      qualifiedEngagement: qualified,
      verifiedConversions: conversions,
      conversionRate: Number(pct(conversions, visits).toFixed(2)),
      bestCampaign: best[0]?._id || "—",
      created: link ? new Date((link as any).createdAt).getTime() : Date.now(),
      funnel: [
        { label: "Shared links", value: shares, pct: shares > 0 ? 100 : 0, color: "#C6FF4D" },
        { label: "Visits", value: visits, pct: Math.min(100, pct(visits, shares)), color: "#9A72FF" },
        { label: "Qualified engagement", value: qualified, pct: Math.min(100, pct(qualified, visits)), color: "#48DDF0" },
        { label: "Verified conversions", value: conversions, pct: Math.min(100, pct(conversions, qualified || visits)), color: "#42D392" }
      ],
      recent: recent.map((r: any) => ({ code: r.code, event: r.eventType, ts: new Date(r.createdAt).getTime() }))
    };
  }

  static async leaderboard(tenantId: string, limit = 10) {
    const rows = await ReferralEvent.aggregate([
      { $match: { tenantId: new Types.ObjectId(tenantId), eventType: "qualified" } },
      { $group: { _id: "$referrerId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $project: { _id: 0, userId: "$_id", displayName: "$user.displayName", avatarUrl: "$user.avatarUrl", wallet: "$user.wallet", count: 1 } }
    ]);
    // Never expose full wallet addresses publicly.
    return rows.map((r: any) => ({ ...r, wallet: r.wallet ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : undefined }));
  }

  static async disableCode(code: string, tenantId: string, actorId: string) {
    const link = await ReferralLink.findOne({ tenantId, code: code.toUpperCase() });
    if (!link) throw ApiError.notFound("Referral code not found");
    await ReferralLink.deleteOne({ _id: link._id });
    await AuditLog.create({
      tenantId, actorId, action: "referral.code_disabled", entity: "ReferralLink", entityId: String(link._id), metadata: { code }
    });
    return { ok: true };
  }
}
