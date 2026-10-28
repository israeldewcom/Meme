import { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/authService";
import { SessionService } from "../services/sessionService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { clientIp } from "../utils/ip";

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(60),
  tenantSlug: z.string().min(1).max(40),
  referralCode: z.string().max(20).optional()
});
export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  tenantSlug: z.string().min(1).max(40)
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(2000) });

export const AuthController = {
  register: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.created(res, await AuthService.register({ ...req.body, ip: clientIp(req) }))),
  login: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await AuthService.login({ ...req.body, ip: clientIp(req) }))),
  refresh: asyncHandler(async (req: Request, res: Response) =>
    ApiResponse.ok(res, await SessionService.rotate(req.body.refreshToken))),
  logout: asyncHandler(async (req: Request, res: Response) => {
    await SessionService.revoke(req.body.refreshToken);
    return ApiResponse.ok(res, { loggedOut: true });
  }),
  logoutAll: asyncHandler(async (req: Request, res: Response) => {
    await SessionService.revokeAll(req.auth!.userId);
    return ApiResponse.ok(res, { loggedOut: true });
  }),
  me: asyncHandler(async (req: Request, res: Response) => ApiResponse.ok(res, { auth: req.auth }))
};
