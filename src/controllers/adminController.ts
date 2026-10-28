import { Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Tenant } from "../models/Tenant";
import { Token } from "../models/Token";
import { User } from "../models/User";
import { AuditLog } from "../models/AuditLog";
import { Report } from "../models/Report";
import { Meme } from "../models/Meme";
import { ReferralEvent } from "../models/Referral";
import { HolderSnapshot } from "../models/HolderSnapshot";
import { AnalyticsService } from "../services/analyticsService";
import { TokenomicsService } from "../services/tokenomicsService";
import { RoadmapService } from "../services/roadmapService";
import { ReferralService } from "../services/referralService";
import { SessionService } from "../services/sessionService";
import { TelegramService } from "../services/telegramService";
import { solanaProvider } from "../services/solanaProvider";
import { invalidateBootstrap } from "../services/cache";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { isBase58Address } from "../utils/validateAddress";
import { parsePaging } from "../utils/paging";
import { uiSupplyString } from "../utils/holderMath";
import { hexColor, safeUrl } from "../utils/zodHelpers";
import { env } from "../config/env";
import { ROLE_RANK, UserRole } from "../types";

export const brandingSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  branding: z
    .object({
      logoUrl: safeUrl.optional(),
      faviconUrl: safeUrl.optional(),
      heroImage: safeUrl.optional(),
      primaryColor: hexColor.optional(),
      secondaryColor: hexColor.optional(),
      socialLinks: z.record(z.string().url().max(500).refine((u) => u.startsWith("https://"))).optional()
    })
    .optional(),
  settings: z
    .object({
      allowUserMemes: z.boolean().optional(),
      requireMemeApproval: z.boolean().optional(),
      maxMemeSizeMB: z.number().min(1).max(20).optional(),
      referralEnabled: z.boolean().optional(),
      telegramChatId: z.string().max(64).optional()
    })
    .optional()
});

export const tokenConfigSchema = z.object({
  mint: z.string().min(32).max(44),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  logoUrl: safeUrl.optional(),
  decimals: z.number().int().min(0).max(18).default(6),
  totalSupply: z.string().regex(/^\d+$/).default("0"),
  circulatingSupply: z.string().regex(/^\d+$/).default("0"),
  explorerUrl: z.string().url().optional(),
  socials: z.record(z.string().url().max(500)).optional(),
  mintAuthorityRevoked: z.boolean().optional(),
  freezeAuthorityRevoked: z.boolean().optional(),
  publish: z.boolean().optional()
});

// Whitelist for updates: no tenantId / mint / authority flags (those are verified on-chain).
export const tokenUpdateSchema = z
  .object({
    symbol: z.string().min(1).max(20),
    name: z.string().min(1).max(120),
    description: z.string().max(4000),
    logoUrl: safeUrl,
    circulatingSupply: z.string().regex(/^\d+$/),
    explorerUrl: z.string().url(),
    socials: z.record(z.string().url().max(500))
  })
  .partial();

const tokenomicsRowSchema = z.object({
  name: z.string().min(1).max(60),
  percentage: z.number().min(0).max(100),
  amount: z.string().regex(/^\d+$/).optional(),
  vesting: z.string().max(500).optional(),
  color: hexColor.optional()
});
export const tokenomicsSchema = z.array(tokenomicsRowSchema).max(30);

const roadmapRowSchema = z.object({
  phase: z.string().min(1).max(40),
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(1000),
  status: z.enum(["planned", "in_progress", "completed", "delayed", "cancelled"]).optional(),
  when: z.string().max(40).optional(),
  evidence: z.string().max(500).optional()
});
export const roadmapSchema = z.array(roadmapRowSchema).max(50);

export const resolveReportSchema = z.object({ action: z.enum(["resolve", "dismiss"]), resolution: z.string().max(1000).optional() });
export const teamUpdateSchema = z.object({
  role: z.enum(["tenant_admin", "admin", "editor", "moderator", "analyst", "member"]).optional(),
  active: z.boolean().optional(),
  banned: z.boolean().optional()
});

const audit = (req: Request, action: string, entity: string, entityId?: string, metadata?: Record<string, unknown>) =>
  AuditLog.create({ tenantId: req.tenantId, actorId: req.auth!.userId, action, entity, entityId, metadata });

/** Best-effort on-chain facts for a mint. */
async function onChainFacts(mint: string) {
  const info = await solanaProvider.getMintInfo(mint);
  if (!info) return null;
  return {
    decimals: info.decimals,
    totalSupply: uiSupplyString(info.supply, info.decimals),
    mintAuthorityRevoked: info.mintAuthority === null,
    freezeAuthorityRevoked: info.freezeAuthority === null,
    authoritiesVerifiedAt: new Date()
  };
}

export const AdminController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const [tokenCount, publishedCount, auditRecent, reportsOpen, memePending, analytics] = await Promise.all([
      Token.countDocuments({ tenantId }),
      Token.countDocuments({ tenantId, published: true }),
      AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
      Report.countDocuments({ tenantId, status: "open" }),
      Meme.countDocuments({ tenantId, status: "pending" }),
      AnalyticsService.overview(tenantId, 30)
    ]);
    return ApiResponse.ok(res, { tenant: req.tenant, tokenCount, publishedCount, auditRecent, reportsOpen, memePending, analytics });
  }),

  updateBranding: asyncHandler(async (req: Request, res: Response) => {
    const patch = req.body as z.infer<typeof brandingSchema>;
    const update: Record<string, unknown> = {};
    if (patch.name) update.name = patch.name;
    for (const [k, v] of Object.entries(patch.branding || {})) update[`branding.${k}`] = v;
    for (const [k, v] of Object.entries(patch.settings || {})) update[`settings.${k}`] = v;
    if (!Object.keys(update).length) throw ApiError.badRequest("Nothing to update");
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, { $set: update }, { new: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");
    await audit(req, "branding.updated", "Tenant", String(tenant._id), { fields: Object.keys(update) });
    await invalidateBootstrap(tenant.slug);
    return ApiResponse.ok(res, tenant);
  }),

  listTokens: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await Token.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean())),

  createToken: asyncHandler(async (req: Request, res: Response) => {
    const { publish, ...body } = req.body as z.infer<typeof tokenConfigSchema>;
    if (!isBase58Address(body.mint)) throw ApiError.badRequest("Invalid Solana mint address");
    if (await Token.exists({ tenantId: req.tenantId, mint: body.mint })) throw ApiError.conflict("Token with this mint already exists for the tenant");

    const facts = await onChainFacts(body.mint);
    if (!facts && !env.DEMO_MODE) throw ApiError.badRequest("Mint not found on-chain (or RPC unavailable)");

    const token = await Token.create({ tenantId: req.tenantId, ...body, ...(facts || {}), published: !!publish, launchDate: publish ? new Date() : undefined });
    await audit(req, "token.created", "Token", String(token._id), { mint: token.mint, onChainVerified: !!facts });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.created(res, token);
  }),

  updateToken: asyncHandler(async (req: Request, res: Response) => {
    const token = await Token.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: req.body }, { new: true });
    if (!token) throw ApiError.notFound("Token not found");
    await audit(req, "token.updated", "Token", String(token._id), { fields: Object.keys(req.body) });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, token);
  }),

  verifyToken: asyncHandler(async (req: Request, res: Response) => {
    const existing = await Token.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) throw ApiError.notFound("Token not found");
    const facts = await onChainFacts(existing.mint);
    if (!facts) throw ApiError.serviceUnavailable("Could not read mint from chain");
    Object.assign(existing, facts);
    await existing.save();
    await audit(req, "token.verified", "Token", String(existing._id));
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, existing);
  }),

  setPublished: (published: boolean) =>
    asyncHandler(async (req: Request, res: Response) => {
      const token = await Token.findOne({ _id: req.params.id, tenantId: req.tenantId });
      if (!token) throw ApiError.notFound("Token not found");
      token.published = published;
      if (published && !token.launchDate) token.launchDate = new Date();
      await token.save();
      await audit(req, published ? "token.published" : "token.unpublished", "Token", String(token._id));
      await invalidateBootstrap(req.tenant.slug);
      return ApiResponse.ok(res, token);
    }),

  featureToken: asyncHandler(async (req: Request, res: Response) => {
    const featured = z.object({ featured: z.boolean() }).parse(req.body).featured;
    const token = await Token.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: { featured } }, { new: true });
    if (!token) throw ApiError.notFound("Token not found");
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, token);
  }),

  getTokenomics: asyncHandler(async (req: Request, res: Response) => {
    const token = await Token.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    if (!token) throw ApiError.notFound("No token configured");
    return ApiResponse.ok(res, await TokenomicsService.getForTenant(req.tenantId!, token.mint));
  }),

  setTokenomics: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof tokenomicsSchema>;
    const token = await Token.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    if (!token) throw ApiError.notFound("No token configured");
    const sum = body.reduce((s, r) => s + r.percentage, 0);
    if (sum > 100.01) throw ApiError.badRequest("Allocation total exceeds 100%");
    const rows = await TokenomicsService.replaceAll(req.tenantId!, token.mint, body);
    await audit(req, "tokenomics.updated", "Token", String(token._id), { total: sum });
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, rows);
  }),

  getRoadmap: asyncHandler(async (req: Request, res: Response) => ApiResponse.ok(res, await RoadmapService.list(req.tenantId!))),

  setRoadmap: asyncHandler(async (req: Request, res: Response) => {
    const items = await RoadmapService.replaceAll(req.tenantId!, req.body);
    await audit(req, "roadmap.updated", "Tenant", req.tenantId);
    await invalidateBootstrap(req.tenant.slug);
    return ApiResponse.ok(res, items);
  }),

  /** Real status, derived from stored data: no fabricated sync times. */
  integrations: asyncHandler(async (req: Request, res: Response) => {
    const [lastToken, lastSnap] = await Promise.all([
      Token.findOne({ tenantId: req.tenantId, "lastMarketData.refreshedAt": { $exists: true } }).sort({ "lastMarketData.refreshedAt": -1 }).select("lastMarketData.refreshedAt").lean(),
      HolderSnapshot.findOne({ tenantId: req.tenantId }).sort({ capturedAt: -1 }).select("capturedAt").lean()
    ]);
    return ApiResponse.ok(res, {
      marketProvider: { name: "DexScreener", birdeyeConfigured: !!env.BIRDEYE_API_KEY, lastSync: lastToken?.lastMarketData?.refreshedAt ?? null },
      holdersProvider: { name: "Solana RPC", lastSync: lastSnap?.capturedAt ?? null },
      telegram: { botConfigured: !!env.TELEGRAM_BOT_TOKEN, chatIdSet: !!req.tenant?.settings?.telegramChatId },
      uploads: { provider: env.UPLOAD_PROVIDER },
      demoMode: env.DEMO_MODE
    });
  }),

  testIntegration: asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    if (id === "telegram") {
      const me = await TelegramService.getMe();
      return ApiResponse.ok(res, { connected: me.ok, message: me.ok ? `Bot @${me.username}` : "Telegram bot token missing or invalid" });
    }
    if (id === "solana") {
      const ok = await solanaProvider.ping();
      return ApiResponse.ok(res, { connected: ok, message: ok ? "RPC reachable" : "RPC unreachable" });
    }
    throw ApiError.notFound("Unknown integration");
  }),

  auditLog: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query, 50, 100);
    const [items, total] = await Promise.all([
      AuditLog.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments({ tenantId: req.tenantId })
    ]);
    return ApiResponse.paginated(res, items, page, limit, total);
  }),

  listReports: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query, 50, 100);
    const query: Record<string, unknown> = { tenantId: req.tenantId };
    const status = String(req.query.status || "");
    if (["open", "reviewing", "resolved", "dismissed"].includes(status)) query.status = status;
    const [items, total] = await Promise.all([
      Report.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Report.countDocuments(query)
    ]);
    return ApiResponse.paginated(res, items, page, limit, total);
  }),

  resolveReport: asyncHandler(async (req: Request, res: Response) => {
    const { action, resolution } = req.body as z.infer<typeof resolveReportSchema>;
    const report = await Report.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!report) throw ApiError.notFound("Report not found");
    report.status = action === "resolve" ? "resolved" : "dismissed";
    report.resolvedBy = new Types.ObjectId(req.auth!.userId);
    report.resolution = resolution;
    await report.save();
    await audit(req, `report.${action}`, "Report", String(report._id));
    return ApiResponse.ok(res, report);
  }),

  listTeam: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await User.find({ tenantId: req.tenantId }).select("email displayName role lastLoginAt wallet active banned").sort({ role: 1, createdAt: -1 }).limit(500).lean())),

  updateTeamMember: asyncHandler(async (req: Request, res: Response) => {
    const { role, active, banned } = req.body as z.infer<typeof teamUpdateSchema>;
    const actorRank = ROLE_RANK[req.auth!.role];
    const target = await User.findOne({ _id: req.params.userId, tenantId: req.tenantId });
    if (!target) throw ApiError.notFound("User not found");
    if (String(target._id) === req.auth!.userId) throw ApiError.forbidden("You cannot change your own role or status");
    if (ROLE_RANK[target.role as UserRole] >= actorRank) throw ApiError.forbidden("You cannot modify a user of equal or higher rank");
    if (role && ROLE_RANK[role] >= actorRank) throw ApiError.forbidden("You cannot assign a role of equal or higher rank");

    if (role !== undefined) target.role = role;
    if (active !== undefined) target.active = active;
    if (banned !== undefined) target.banned = banned;
    await target.save();
    await SessionService.revokeAll(String(target._id)); // role/ban changes take effect immediately
    await audit(req, "team.updated", "User", String(target._id), { role, active, banned });
    return ApiResponse.ok(res, { id: String(target._id), role: target.role, active: target.active, banned: target.banned });
  }),

  analytics: asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const [overview, funnel] = await Promise.all([AnalyticsService.overview(req.tenantId!, days), AnalyticsService.funnel(req.tenantId!, days)]);
    return ApiResponse.ok(res, { overview, funnel });
  }),

  referralSummary: asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const tid = new Types.ObjectId(req.tenantId);
    const count = (eventType: string) => ReferralEvent.countDocuments({ tenantId: tid, eventType, createdAt: { $gte: since } });
    const [visits, qualified, conversions, shares, top] = await Promise.all([
      count("visit"), count("qualified"), count("conversion"), count("share"),
      ReferralEvent.aggregate([
        { $match: { tenantId: tid, eventType: "qualified", createdAt: { $gte: since } } },
        { $group: { _id: "$code", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);
    return ApiResponse.ok(res, { visits, qualified, conversions, shares, topCodes: top });
  }),

  disableReferralCode: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await ReferralService.disableCode(req.params.code, req.tenantId!, req.auth!.userId)))
};
