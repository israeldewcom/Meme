import { Request, Response } from "express";
import { z } from "zod";
import { MarketService } from "../services/marketService";
import { HolderService } from "../services/holderService";
import { Token } from "../models/Token";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { isBase58Address } from "../utils/validateAddress";
import { ApiError } from "../utils/ApiError";

export const historyQuery = z.object({ range: z.enum(["1H", "6H", "24H", "7D", "30D"]).default("24H") });

/** Only tokens the tenant has published can be queried: stops the API being used as a free price proxy. */
async function publishedToken(req: Request) {
  const mint = String(req.params.mint || "");
  if (!isBase58Address(mint)) throw ApiError.badRequest("Invalid mint address");
  const token = await Token.findOne({ tenantId: req.tenantId, mint, published: true }).lean();
  if (!token) throw ApiError.notFound("Token not found");
  return token;
}

export const MarketController = {
  getLive: asyncHandler(async (req: Request, res: Response) => {
    const token = await publishedToken(req);
    const quote = await MarketService.getLiveQuote(token.mint, token);
    return ApiResponse.ok(res, quote);
  }),

  getHistory: asyncHandler(async (req: Request, res: Response) => {
    const token = await publishedToken(req);
    const { points, isDemo } = await MarketService.getHistory(token.mint, req.validatedQuery.range);
    res.setHeader("X-Data-Source", isDemo ? "demo" : "live");
    return ApiResponse.ok(res, points);
  }),

  getHolders: asyncHandler(async (req: Request, res: Response) => {
    const token = await publishedToken(req);
    return ApiResponse.ok(res, await HolderService.getPayload(req.tenantId!, token.mint));
  })
};
