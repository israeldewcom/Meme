import { Request, Response } from "express";
import { z } from "zod";
import { WalletAuthService } from "../services/walletAuthService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clientIp } from "../utils/ip";

export const challengeSchema = z.object({ wallet: z.string().min(32).max(44), tenantSlug: z.string().min(1).max(40) });
export const verifySchema = z.object({
  wallet: z.string().min(32).max(44),
  signature: z.string().min(10).max(200),
  message: z.string().min(10).max(1000),
  challengeToken: z.string().min(10).max(2000)
});

export const WalletController = {
  challenge: asyncHandler(async (req: Request, res: Response) => ApiResponse.ok(res, await WalletAuthService.issueChallenge(req.body))),
  verify: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await WalletAuthService.verifyAndIssue({ ...req.body, ip: clientIp(req) })))
};
