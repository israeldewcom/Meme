import { Request, Response } from "express";
import { z } from "zod";
import { AnalyticsService } from "../services/analyticsService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clientIp } from "../utils/ip";

export const eventSchema = z.object({
  eventType: z.enum(["visit", "studio_session", "export", "share", "referral_share"]),
  path: z.string().max(200).optional(),
  metadata: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).refine((m) => Object.keys(m).length <= 10).optional()
});

export const AnalyticsController = {
  record: asyncHandler(async (req: Request, res: Response) => {
    await AnalyticsService.record({
      tenantId: req.tenantId!, eventType: req.body.eventType, ip: clientIp(req), path: req.body.path,
      userId: req.auth?.userId, metadata: req.body.metadata
    });
    return ApiResponse.ok(res, { recorded: true });
  }),
  publicOverview: asyncHandler(async (req: Request, res: Response) => {
    const o = await AnalyticsService.overview(req.tenantId!, 30);
    return ApiResponse.ok(res, {
      studioSessions: o.studioSessions, exports: o.exports, memeSubmits: o.memeSubmits, challengeEntries: o.challengeEntries,
      referralVisits: o.referralVisits, memeApproved: o.memeApproved, activeChallenges: o.activeChallenges
    });
  })
};
