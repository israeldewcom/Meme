import { Request, Response } from "express";
import { z } from "zod";
import { AnnouncementService } from "../services/announcementService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { invalidateBootstrap } from "../services/cache";

export const createAnnouncementSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(4000),
  tone: z.enum(["lime", "violet", "cyan", "amber", "red"]).optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
  sendToTelegram: z.boolean().optional()
});

export const AnnouncementController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const ann = await AnnouncementService.create({
      tenantId: req.tenantId!, authorId: req.auth!.userId, title: req.body.title, body: req.body.body, tone: req.body.tone,
      pinned: req.body.pinned, expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      sendToTelegram: req.body.sendToTelegram, telegramChatId: req.tenant?.settings?.telegramChatId, tenantName: req.tenant?.name
    });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.created(res, AnnouncementService.toFrontend(ann.toObject()));
  }),
  list: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, (await AnnouncementService.list(req.tenantId!, 50)).map(AnnouncementService.toFrontend))),
  remove: asyncHandler(async (req: Request, res: Response) => {
    await AnnouncementService.remove(req.params.id, req.tenantId!, req.auth!.userId);
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.noContent(res);
  })
};
