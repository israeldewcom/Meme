import { Request, Response } from "express";
import { z } from "zod";
import { ChallengeService } from "../services/challengeService";
import { AnalyticsService } from "../services/analyticsService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clientIp } from "../utils/ip";
import { hexColor, objectId } from "../utils/zodHelpers";
import { invalidateBootstrap } from "../services/cache";

export const createChallengeSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().min(2).max(4000),
  start: z.string().datetime(),
  end: z.string().datetime(),
  judging: z.string().min(2).max(500),
  prize: z.string().min(1).max(500),
  glyph: z.string().max(4).optional(),
  gradientFrom: hexColor.optional(),
  gradientTo: hexColor.optional(),
  rules: z.array(z.string().max(500)).max(30).optional()
});
export const enterSchema = z.object({ memeId: objectId.optional() });
export const endSchema = z.object({ winners: z.array(objectId).max(50).optional() });

export const ChallengeController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const c = await ChallengeService.create({
      ...req.body, tenantId: req.tenantId!, createdBy: req.auth!.userId, start: new Date(req.body.start), end: new Date(req.body.end)
    });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.created(res, ChallengeService.toFrontend(c.toObject()));
  }),

  list: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, (await ChallengeService.list(req.tenantId!)).map(ChallengeService.toFrontend))),

  enter: asyncHandler(async (req: Request, res: Response) => {
    const c = await ChallengeService.enter({ challengeId: req.params.id, tenantId: req.tenantId!, userId: req.auth!.userId, memeId: req.body.memeId });
    await AnalyticsService.record({
      tenantId: req.tenantId!, eventType: "challenge_entry", ip: clientIp(req), userId: req.auth!.userId, metadata: { challengeId: req.params.id }
    });
    return ApiResponse.ok(res, ChallengeService.toFrontend(c.toObject()));
  }),

  end: asyncHandler(async (req: Request, res: Response) => {
    const c = await ChallengeService.end({ challengeId: req.params.id, tenantId: req.tenantId!, actorId: req.auth!.userId, winners: req.body.winners });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, ChallengeService.toFrontend(c.toObject()));
  })
};
