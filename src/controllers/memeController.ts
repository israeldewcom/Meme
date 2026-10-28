import { Request, Response } from "express";
import { z } from "zod";
import { MemeService } from "../services/memeService";
import { AnalyticsService } from "../services/analyticsService";
import { Meme } from "../models/Meme";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePaging } from "../utils/paging";
import { clientIp } from "../utils/ip";
import { hexColor, objectId, safeUrl } from "../utils/zodHelpers";
import { invalidateBootstrap } from "../services/cache";
import { MEME_CATEGORIES } from "../config/constants";

export const memeCreateSchema = z.object({
  title: z.string().min(2).max(120),
  caption: z.string().max(500).optional(),
  imageUrl: safeUrl,
  category: z.enum(MEME_CATEGORIES).optional(),
  tags: z.array(z.string().max(24)).max(10).optional(),
  gradientFrom: hexColor.optional(),
  gradientTo: hexColor.optional(),
  tokenId: objectId.optional(),
  challengeId: objectId.optional()
});
export const moderateSchema = z.object({ status: z.enum(["approved", "rejected", "removed"]), note: z.string().max(500).optional() });
export const reportSchema = z.object({
  reason: z.enum(["copyright", "harassment", "misinformation", "spam", "adult", "other"]),
  details: z.string().max(2000).optional()
});

export const MemeController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const meme = await MemeService.create({
      ...req.body,
      tenantId: req.tenantId!,
      uploaderId: req.auth!.userId,
      requireApproval: req.tenant?.settings?.requireMemeApproval ?? true,
      allowUserMemes: req.tenant?.settings?.allowUserMemes ?? true
    });
    await AnalyticsService.record({
      tenantId: req.tenantId!, eventType: "meme_submit", ip: clientIp(req), userId: req.auth!.userId, metadata: { memeId: String(meme._id) }
    });
    if (meme.status === "approved") await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.created(res, MemeService.toFrontend(meme.toObject()));
  }),

  listApproved: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query);
    const r = await MemeService.list(req.tenantId!, { status: "approved", page, limit, sort: req.query.sort === "popular" ? "popular" : "latest" });
    return ApiResponse.paginated(res, r.items.map(MemeService.toFrontend), r.page, r.limit, r.total);
  }),

  listPending: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query);
    const r = await MemeService.list(req.tenantId!, { status: "pending", page, limit });
    return ApiResponse.paginated(res, r.items, r.page, r.limit, r.total);
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query);
    const filter = { tenantId: req.tenantId, uploaderId: req.auth!.userId };
    const [items, total] = await Promise.all([
      Meme.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Meme.countDocuments(filter)
    ]);
    return ApiResponse.paginated(res, items.map(MemeService.toFrontend), page, limit, total);
  }),

  moderate: asyncHandler(async (req: Request, res: Response) => {
    const meme = await MemeService.moderate({ memeId: req.params.id, tenantId: req.tenantId!, moderatorId: req.auth!.userId, ...req.body });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, MemeService.toFrontend(meme.toObject()));
  }),

  like: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await MemeService.like(req.params.id, req.tenantId!, req.auth!.userId))),
  unlike: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await MemeService.unlike(req.params.id, req.tenantId!, req.auth!.userId))),
  share: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await MemeService.share(req.params.id, req.tenantId!, req.auth!.userId))),

  report: asyncHandler(async (req: Request, res: Response) => {
    await MemeService.report({
      memeId: req.params.id, tenantId: req.tenantId!, reporterId: req.auth?.userId, reporterIp: clientIp(req), ...req.body
    });
    return ApiResponse.ok(res, { reported: true });
  })
};
