import { Types } from "mongoose";
import { AnalyticsEvent, AnalyticsEventType } from "../models/AnalyticsEvent";
import { Meme } from "../models/Meme";
import { Challenge } from "../models/Challenge";
import { ReferralEvent } from "../models/Referral";
import { ipHash } from "../utils/crypto";
import { env } from "../config/env";

export class AnalyticsService {
  static async record(input: {
    tenantId: string; eventType: AnalyticsEventType; ip: string; path?: string; userId?: string; metadata?: Record<string, unknown>;
  }) {
    await AnalyticsEvent.create({
      tenantId: input.tenantId,
      eventType: input.eventType,
      path: input.path?.split("?")[0].slice(0, 120),
      ipHash: ipHash(input.ip, env.JWT_SECRET),
      userId: input.userId,
      metadata: input.metadata
    });
  }

  static async overview(tenantId: string, days = 30) {
    const tid = new Types.ObjectId(tenantId);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const count = (eventType: AnalyticsEventType) => AnalyticsEvent.countDocuments({ tenantId: tid, eventType, createdAt: { $gte: since } });

    const [visits, uniqueIps, studioSessions, exportsCount, memeSubmits, challengeEntries, referralVisits, memeApproved, activeChallenges, popularPages] =
      await Promise.all([
        count("visit"),
        AnalyticsEvent.distinct("ipHash", { tenantId: tid, eventType: "visit", createdAt: { $gte: since } }),
        count("studio_session"),
        count("export"),
        count("meme_submit"),
        count("challenge_entry"),
        ReferralEvent.countDocuments({ tenantId: tid, eventType: "visit", createdAt: { $gte: since } }),
        Meme.countDocuments({ tenantId: tid, status: "approved" }),
        Challenge.countDocuments({ tenantId: tid, status: { $ne: "ended" }, start: { $lte: new Date() }, end: { $gt: new Date() } }),
        AnalyticsEvent.aggregate([
          { $match: { tenantId: tid, eventType: "visit", createdAt: { $gte: since } } },
          { $group: { _id: "$path", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      ]);

    return {
      visits,
      uniqueVisitors: uniqueIps.length,
      studioSessions,
      exports: exportsCount,
      memeSubmits,
      challengeEntries,
      referralVisits,
      memeApproved,
      activeChallenges,
      popularPages: popularPages.map((p: any) => ({ path: p._id, count: p.count }))
    };
  }

  static async funnel(tenantId: string, days = 30) {
    const tid = new Types.ObjectId(tenantId);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const [landing, community, share, qualified] = await Promise.all([
      AnalyticsEvent.countDocuments({ tenantId: tid, eventType: "visit", createdAt: { $gte: since } }),
      AnalyticsEvent.countDocuments({ tenantId: tid, eventType: "visit", path: /^\/community/, createdAt: { $gte: since } }),
      ReferralEvent.countDocuments({ tenantId: tid, eventType: "share", createdAt: { $gte: since } }),
      ReferralEvent.countDocuments({ tenantId: tid, eventType: "qualified", createdAt: { $gte: since } })
    ]);
    const p = (n: number) => (landing ? (n / landing) * 100 : 0);
    return [
      { label: "Landing page visit", value: landing, pct: 100 },
      { label: "Community page visit", value: community, pct: p(community) },
      { label: "Referral share", value: share, pct: p(share) },
      { label: "Qualified visit", value: qualified, pct: p(qualified) }
    ];
  }
}
