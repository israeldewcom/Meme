import { Request, Response } from "express";
import { z } from "zod";
import { ReferralService } from "../services/referralService";
import { AnalyticsService } from "../services/analyticsService";
import { env } from "../config/env";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clientIp } from "../utils/ip";

// Public clients may only report visits and shares. Qualified/conversion are server-side only.
export const trackSchema = z.object({
  code: z.string().min(4).max(20),
  eventType: z.enum(["visit", "share"]).default("visit"),
  referrer: z.string().max(400).optional(),
  campaign: z.string().max(80).optional()
});

export const ReferralController = {
  myLink: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await ReferralService.getOrCreateLink(req.auth!.userId, req.tenantId!, req.tenant?.domain ? `https://${req.tenant.domain}` : env.PUBLIC_SITE_URL))),

  myStats: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, { stats: await ReferralService.getStats(req.auth!.userId, req.tenantId!) })),

  leaderboard: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await ReferralService.leaderboard(req.tenantId!, Math.min(50, Math.max(1, Number(req.query.limit) || 10))))),

  track: asyncHandler(async (req: Request, res: Response) => {
    const result = await ReferralService.trackPublicEvent({
      tenantId: req.tenantId!, code: req.body.code, eventType: req.body.eventType, ip: clientIp(req),
      userAgent: req.get("user-agent"), referrer: req.body.referrer, campaign: req.body.campaign
    });
    if (req.body.eventType === "visit" && !("deduped" in result)) {
      await AnalyticsService.record({ tenantId: req.tenantId!, eventType: "visit", ip: clientIp(req), path: "/referral", metadata: { code: req.body.code } });
    }
    return ApiResponse.ok(res, result);
  })
};
