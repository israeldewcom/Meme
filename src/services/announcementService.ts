import { Announcement } from "../models/Announcement";
import { AuditLog } from "../models/AuditLog";
import { telegramQueue } from "../workers/queues";
import { ApiError } from "../utils/ApiError";
import { FrontendAnnouncement } from "../types";

export class AnnouncementService {
  static toFrontend(a: any): FrontendAnnouncement {
    return { id: String(a._id), title: a.title, body: a.body, date: new Date(a.publishedAt).getTime(), pinned: !!a.pinned, tone: a.tone || "lime" };
  }

  static async create(input: {
    tenantId: string; authorId: string; title: string; body: string; tone?: "lime" | "violet" | "cyan" | "amber" | "red";
    pinned?: boolean; expiresAt?: Date; sendToTelegram?: boolean; telegramChatId?: string; tenantName?: string;
  }) {
    const ann = await Announcement.create({
      tenantId: input.tenantId, authorId: input.authorId, title: input.title, body: input.body,
      tone: input.tone || "lime", pinned: !!input.pinned, publishedAt: new Date(), expiresAt: input.expiresAt
    });

    if (input.sendToTelegram && input.telegramChatId) {
      await telegramQueue.add(
        "announcement",
        { chatId: input.telegramChatId, title: ann.title, body: ann.body, tenantName: input.tenantName || "Project" },
        { removeOnComplete: true, removeOnFail: 100, attempts: 3, backoff: { type: "exponential", delay: 3000 } }
      );
      ann.telegramQueued = true;
      await ann.save();
    }
    await AuditLog.create({ tenantId: input.tenantId, actorId: input.authorId, action: "announcement.created", entity: "Announcement", entityId: String(ann._id) });
    return ann;
  }

  static list(tenantId: string, limit = 20) {
    return Announcement.find({ tenantId, $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ pinned: -1, publishedAt: -1 })
      .limit(limit)
      .lean();
  }

  static async remove(id: string, tenantId: string, actorId: string) {
    const ann = await Announcement.findOneAndDelete({ _id: id, tenantId });
    if (!ann) throw ApiError.notFound("Announcement not found");
    await AuditLog.create({ tenantId, actorId, action: "announcement.deleted", entity: "Announcement", entityId: id });
    return { ok: true };
  }
}
