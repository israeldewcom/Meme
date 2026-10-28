import { Meme, MemeStatus } from "../models/Meme";
import { MemeLike } from "../models/MemeLike";
import { Report } from "../models/Report";
import { AuditLog } from "../models/AuditLog";
import { User } from "../models/User";
import { Token } from "../models/Token";
import { Challenge } from "../models/Challenge";
import { ApiError } from "../utils/ApiError";
import { FrontendMeme } from "../types";
import { MEME_CATEGORIES, AUTO_FLAG_REPORT_THRESHOLD } from "../config/constants";
import { redis } from "../config/redis";
import { ReferralService } from "./referralService";

export class MemeService {
  static async create(input: {
    tenantId: string; uploaderId: string; imageUrl: string; title: string; caption?: string; tags?: string[];
    category?: string; tokenId?: string; challengeId?: string; requireApproval: boolean; allowUserMemes: boolean;
    gradientFrom?: string; gradientTo?: string;
  }) {
    if (!input.allowUserMemes) throw ApiError.forbidden("Meme submissions are disabled for this community");
    const uploader = await User.findById(input.uploaderId).lean();
    if (!uploader || uploader.banned || !uploader.active) throw ApiError.forbidden("Uploader not allowed");

    if (input.tokenId && !(await Token.exists({ _id: input.tokenId, tenantId: input.tenantId }))) throw ApiError.badRequest("Unknown token");
    if (input.challengeId && !(await Challenge.exists({ _id: input.challengeId, tenantId: input.tenantId }))) throw ApiError.badRequest("Unknown challenge");

    const firstSubmission = !(await Meme.exists({ tenantId: input.tenantId, uploaderId: input.uploaderId }));

    const meme = await Meme.create({
      tenantId: input.tenantId,
      tokenId: input.tokenId,
      uploaderId: input.uploaderId,
      uploaderDisplayName: uploader.displayName,
      title: input.title,
      caption: input.caption,
      imageUrl: input.imageUrl,
      category: input.category && (MEME_CATEGORIES as readonly string[]).includes(input.category) ? input.category : "classic",
      tags: [...new Set((input.tags || []).map((t) => t.toLowerCase().trim()).filter(Boolean))],
      gradientFrom: input.gradientFrom || "#C6FF4D",
      gradientTo: input.gradientTo || "#4A8F1E",
      status: (input.requireApproval ? "pending" : "approved") as MemeStatus,
      challengeId: input.challengeId
    });

    if (firstSubmission && uploader.referredBy) {
      await ReferralService.recordForReferrer({
        tenantId: input.tenantId, referrerId: String(uploader.referredBy), eventType: "qualified", metadata: { memeId: String(meme._id) }
      }).catch(() => undefined);
    }
    return meme;
  }

  static async list(
    tenantId: string,
    filter: { status?: MemeStatus; category?: string; page: number; limit: number; sort?: "latest" | "popular" }
  ) {
    const query: Record<string, unknown> = { tenantId };
    if (filter.status) query.status = filter.status;
    if (filter.category) query.category = filter.category;
    const sort: Record<string, 1 | -1> =
      filter.sort === "popular" ? { likes: -1, createdAt: -1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      Meme.find(query).sort(sort).skip((filter.page - 1) * filter.limit).limit(filter.limit).lean(),
      Meme.countDocuments(query)
    ]);
    return { items, total, page: filter.page, limit: filter.limit };
  }

  static toFrontend(m: any): FrontendMeme {
    return {
      id: String(m._id),
      title: m.title,
      author: m.uploaderDisplayName || "anonymous",
      cat: m.category || "classic",
      likes: m.likes || 0,
      shares: m.shares || 0,
      g1: m.gradientFrom || "#C6FF4D",
      g2: m.gradientTo || "#4A8F1E",
      date: new Date(m.createdAt).getTime(),
      imageUrl: m.imageUrl,
      status: m.status
    };
  }

  static async moderate(input: { memeId: string; tenantId: string; moderatorId: string; status: MemeStatus; note?: string }) {
    const meme = await Meme.findOneAndUpdate(
      { _id: input.memeId, tenantId: input.tenantId },
      { $set: { status: input.status, moderatedBy: input.moderatorId, moderationNote: input.note } },
      { new: true }
    );
    if (!meme) throw ApiError.notFound("Meme not found");
    await AuditLog.create({
      tenantId: input.tenantId, actorId: input.moderatorId, action: `meme.${input.status}`,
      entity: "Meme", entityId: input.memeId, metadata: { note: input.note }
    });
    return meme;
  }

  /** One like per user per meme (unique index enforces it). */
  static async like(memeId: string, tenantId: string, userId: string) {
    const meme = await Meme.findOne({ _id: memeId, tenantId, status: "approved" }).select("likes").lean();
    if (!meme) throw ApiError.notFound("Meme not found or not approved");
    try {
      await MemeLike.create({ tenantId, memeId, userId });
    } catch (e: any) {
      if (e?.code === 11000) return { likes: meme.likes, liked: true };
      throw e;
    }
    const updated = await Meme.findByIdAndUpdate(memeId, { $inc: { likes: 1 } }, { new: true }).select("likes").lean();
    return { likes: updated?.likes ?? meme.likes + 1, liked: true };
  }

  static async unlike(memeId: string, tenantId: string, userId: string) {
    const meme = await Meme.findOne({ _id: memeId, tenantId }).select("likes").lean();
    if (!meme) throw ApiError.notFound("Meme not found");
    const res = await MemeLike.deleteOne({ memeId, userId });
    if (!res.deletedCount) return { likes: meme.likes, liked: false };
    const updated = await Meme.findOneAndUpdate({ _id: memeId, likes: { $gt: 0 } }, { $inc: { likes: -1 } }, { new: true }).select("likes").lean();
    return { likes: updated?.likes ?? 0, liked: false };
  }

  /** Counts at most once per user per meme per day. */
  static async share(memeId: string, tenantId: string, userId: string) {
    const meme = await Meme.findOne({ _id: memeId, tenantId, status: "approved" }).select("shares").lean();
    if (!meme) throw ApiError.notFound("Meme not found or not approved");
    const first = await redis.set(`share:${memeId}:${userId}`, "1", "EX", 86400, "NX");
    if (first !== "OK") return { shares: meme.shares };
    const updated = await Meme.findByIdAndUpdate(memeId, { $inc: { shares: 1 } }, { new: true }).select("shares").lean();
    return { shares: updated?.shares ?? meme.shares + 1 };
  }

  static async report(input: { memeId: string; tenantId: string; reporterId?: string; reporterIp: string; reason: string; details?: string }) {
    const meme = await Meme.findOne({ _id: input.memeId, tenantId: input.tenantId }).select("_id status").lean();
    if (!meme) throw ApiError.notFound("Meme not found");

    if (input.reporterId && (await Report.exists({ targetId: input.memeId, reporterId: input.reporterId, status: { $in: ["open", "reviewing"] } }))) {
      return { ok: true, duplicate: true };
    }
    await Report.create({
      tenantId: input.tenantId, reporterId: input.reporterId, reporterIp: input.reporterIp,
      targetType: "meme", targetId: input.memeId, reason: input.reason, details: input.details
    });
    const updated = await Meme.findByIdAndUpdate(input.memeId, { $inc: { reportCount: 1 } }, { new: true }).select("reportCount status").lean();
    // Auto-flag: pull heavily reported memes back into the moderation queue.
    if (updated && updated.status === "approved" && updated.reportCount >= AUTO_FLAG_REPORT_THRESHOLD) {
      await Meme.updateOne({ _id: input.memeId, status: "approved" }, { $set: { status: "pending", moderationNote: "Auto-flagged by reports" } });
    }
    return { ok: true };
  }

  static async remove(memeId: string, tenantId: string, actorId: string) {
    const meme = await Meme.findOneAndUpdate({ _id: memeId, tenantId }, { $set: { status: "removed" } }, { new: true });
    if (!meme) throw ApiError.notFound("Meme not found");
    await AuditLog.create({ tenantId, actorId, action: "meme.removed", entity: "Meme", entityId: memeId });
    return meme;
  }
}
