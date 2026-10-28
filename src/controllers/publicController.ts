import { Request, Response } from "express";
import { Tenant } from "../models/Tenant";
import { Token } from "../models/Token";
import { Meme } from "../models/Meme";
import { Challenge } from "../models/Challenge";
import { Allocation } from "../models/Tokenomics";
import { RoadmapItem } from "../models/RoadmapItem";
import { MemeService } from "../services/memeService";
import { ChallengeService } from "../services/challengeService";
import { AnnouncementService } from "../services/announcementService";
import { RoadmapService } from "../services/roadmapService";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { parsePaging } from "../utils/paging";
import { cacheGet, cacheSet } from "../config/redis";
import { CACHE_KEYS, CACHE_TTL, MEME_CATEGORIES } from "../config/constants";

function publicToken(t: any) {
  return {
    id: String(t._id), mint: t.mint, symbol: t.symbol, name: t.name, description: t.description, logoUrl: t.logoUrl,
    decimals: t.decimals, totalSupply: t.totalSupply, circulatingSupply: t.circulatingSupply, launchDate: t.launchDate,
    poolCreatedAt: t.poolCreatedAt, pairAddress: t.pairAddress, explorerUrl: t.explorerUrl, socials: t.socials,
    featured: t.featured, mintAuthorityRevoked: t.mintAuthorityRevoked, freezeAuthorityRevoked: t.freezeAuthorityRevoked,
    authoritiesVerified: !!t.authoritiesVerifiedAt
  };
}

const authorityLabel = (revoked: boolean, verified: boolean) =>
  revoked ? (verified ? "Revoked (verified on-chain)" : "Revoked (self-reported)") : verified ? "Active (verified on-chain)" : "Active";

export const bootstrap = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const cached = await cacheGet<any>(CACHE_KEYS.bootstrap(slug));
  if (cached) return ApiResponse.ok(res, cached);

  const tenant = await Tenant.findOne({ slug, active: true }).lean();
  if (!tenant) throw ApiError.notFound("Tenant not found");

  const [tokens, memes, challenges, announcements, roadmap] = await Promise.all([
    Token.find({ tenantId: tenant._id, published: true }).sort({ featured: -1, createdAt: -1 }).lean(),
    Meme.find({ tenantId: tenant._id, status: "approved" }).sort({ createdAt: -1 }).limit(24).lean(),
    Challenge.find({ tenantId: tenant._id }).sort({ end: -1 }).limit(20).lean(),
    AnnouncementService.list(String(tenant._id), 10),
    RoadmapItem.find({ tenantId: tenant._id }).sort({ order: 1 }).lean()
  ]);

  const primary = tokens[0];
  // Internal settings (e.g. Telegram chat id) are never exposed publicly.
  const { telegramChatId: _omit, ...publicSettings } = (tenant.settings || {}) as any;

  const payload = {
    tenant: { name: tenant.name, slug: tenant.slug, branding: tenant.branding, settings: publicSettings, tokenDefaults: tenant.tokenDefaults },
    project: primary
      ? {
          id: String(primary._id),
          name: tenant.name,
          tokenName: primary.name,
          ticker: primary.symbol,
          network: tenant.tokenDefaults.network,
          address: primary.mint,
          explorer: primary.explorerUrl,
          description: primary.description || "",
          circulatingSupply: Number(primary.circulatingSupply) || 0,
          totalSupply: Number(primary.totalSupply) || 0,
          decimals: primary.decimals,
          mintAuthority: authorityLabel(primary.mintAuthorityRevoked, !!primary.authoritiesVerifiedAt),
          freezeAuthority: authorityLabel(primary.freezeAuthorityRevoked, !!primary.authoritiesVerifiedAt)
        }
      : null,
    tokens: tokens.map(publicToken),
    memes: memes.map(MemeService.toFrontend),
    challenges: challenges.map(ChallengeService.toFrontend),
    announcements: announcements.map(AnnouncementService.toFrontend),
    roadmap: roadmap.map(RoadmapService.toFrontend)
  };

  await cacheSet(CACHE_KEYS.bootstrap(slug), payload, CACHE_TTL.bootstrap);
  return ApiResponse.ok(res, payload);
});

export const listMemesPublic = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaging(req.query);
  const cat = typeof req.query.category === "string" ? req.query.category : undefined;
  const category = cat && (MEME_CATEGORIES as readonly string[]).includes(cat) ? cat : undefined;
  const result = await MemeService.list(req.tenantId!, {
    status: "approved", category, page, limit, sort: req.query.sort === "popular" ? "popular" : "latest"
  });
  return ApiResponse.paginated(res, result.items.map(MemeService.toFrontend), result.page, result.limit, result.total);
});

export const listChallengesPublic = asyncHandler(async (req: Request, res: Response) => {
  const items = await ChallengeService.list(req.tenantId!);
  return ApiResponse.ok(res, items.map(ChallengeService.toFrontend));
});

export const listAnnouncementsPublic = asyncHandler(async (req: Request, res: Response) => {
  const items = await AnnouncementService.list(req.tenantId!, 20);
  return ApiResponse.ok(res, items.map(AnnouncementService.toFrontend));
});

export const getTokenomics = asyncHandler(async (req: Request, res: Response) => {
  const token = await Token.findOne({ tenantId: req.tenantId, published: true }).sort({ featured: -1, createdAt: -1 }).lean();
  if (!token) throw ApiError.notFound("No published token");
  const rows = await Allocation.find({ tenantId: req.tenantId, tokenId: token._id }).sort({ order: 1 }).lean();
  return ApiResponse.ok(res, rows.map((r) => ({ name: r.name, pct: r.percentage, amount: Number(r.amount), vesting: r.vesting, color: r.color })));
});

export const getRoadmap = asyncHandler(async (req: Request, res: Response) => {
  const items = await RoadmapItem.find({ tenantId: req.tenantId }).sort({ order: 1 }).lean();
  return ApiResponse.ok(res, items.map(RoadmapService.toFrontend));
});
