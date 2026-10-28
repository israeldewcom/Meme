import { Challenge } from "../models/Challenge";
import { Meme } from "../models/Meme";
import { AuditLog } from "../models/AuditLog";
import { ApiError } from "../utils/ApiError";
import { FrontendChallenge } from "../types";

export class ChallengeService {
  static effectiveStatus(c: { status: string; start: Date | string; end: Date | string }): "live" | "upcoming" | "ended" {
    const now = Date.now();
    if (c.status === "ended" || new Date(c.end).getTime() <= now) return "ended";
    if (new Date(c.start).getTime() > now) return "upcoming";
    return "live";
  }

  static toFrontend(c: any): FrontendChallenge {
    return {
      id: String(c._id),
      title: c.title,
      desc: c.description,
      status: this.effectiveStatus(c),
      start: new Date(c.start).getTime(),
      end: new Date(c.end).getTime(),
      entries: Array.isArray(c.entries) ? c.entries.length : 0,
      judging: c.judging || "Community vote",
      prize: c.prize || "",
      g1: c.gradientFrom || "#C6FF4D",
      g2: c.gradientTo || "#4A8F1E",
      glyph: c.glyph || "★"
    };
  }

  static list(tenantId: string) {
    return Challenge.find({ tenantId }).sort({ end: -1 }).limit(50).lean();
  }

  static async create(input: {
    tenantId: string; createdBy: string; title: string; description: string; start: Date; end: Date;
    judging: string; prize: string; glyph?: string; gradientFrom?: string; gradientTo?: string; rules?: string[];
  }) {
    if (input.end <= input.start) throw ApiError.badRequest("End must be after start");
    return Challenge.create({
      ...input,
      glyph: input.glyph || "★",
      gradientFrom: input.gradientFrom || "#C6FF4D",
      gradientTo: input.gradientTo || "#4A8F1E",
      rules: input.rules || [],
      status: input.start.getTime() > Date.now() ? "upcoming" : "live"
    });
  }

  /** Atomic: the time window, ended flag and "already entered" are all part of the update filter. */
  static async enter(input: { challengeId: string; tenantId: string; userId: string; memeId?: string }) {
    if (input.memeId) {
      const meme = await Meme.exists({ _id: input.memeId, tenantId: input.tenantId, uploaderId: input.userId, status: { $ne: "removed" } });
      if (!meme) throw ApiError.badRequest("Meme not found or not yours");
    }
    const now = new Date();
    const updated = await Challenge.findOneAndUpdate(
      {
        _id: input.challengeId, tenantId: input.tenantId, status: { $ne: "ended" },
        start: { $lte: now }, end: { $gt: now }, "entries.userId": { $ne: input.userId }
      },
      { $push: { entries: { userId: input.userId, memeId: input.memeId, submittedAt: now } } },
      { new: true }
    );
    if (updated) return updated;

    const c = await Challenge.findOne({ _id: input.challengeId, tenantId: input.tenantId }).lean();
    if (!c) throw ApiError.notFound("Challenge not found");
    if (this.effectiveStatus(c) === "ended") throw ApiError.badRequest("Challenge ended");
    if (this.effectiveStatus(c) === "upcoming") throw ApiError.badRequest("Challenge has not started");
    throw ApiError.conflict("You have already entered this challenge");
  }

  static async end(input: { challengeId: string; tenantId: string; actorId: string; winners?: string[] }) {
    const challenge = await Challenge.findOne({ _id: input.challengeId, tenantId: input.tenantId });
    if (!challenge) throw ApiError.notFound("Challenge not found");
    if (input.winners?.length) {
      const entrants = new Set(challenge.entries.map((e) => String(e.userId)));
      if (!input.winners.every((w) => entrants.has(w))) throw ApiError.badRequest("Winners must be challenge entrants");
      challenge.winners = input.winners as any;
    }
    challenge.status = "ended";
    challenge.resultsPublished = true;
    await challenge.save();
    await AuditLog.create({
      tenantId: input.tenantId, actorId: input.actorId, action: "challenge.ended", entity: "Challenge",
      entityId: input.challengeId, metadata: { winners: input.winners || [] }
    });
    return challenge;
  }
}
