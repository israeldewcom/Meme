import { Request, Response } from "express";
import { UploadService } from "../services/uploadService";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { UPLOAD_FOLDERS } from "../config/constants";
import { ADMIN_ROLES } from "../middleware/auth";

export const UploadController = {
  single: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest("No file uploaded");
    const folder = String(req.query.folder || "memes");
    if (!(UPLOAD_FOLDERS as readonly string[]).includes(folder)) throw ApiError.badRequest("Invalid upload folder");
    if (folder === "branding" && !ADMIN_ROLES.edit.includes(req.auth!.role)) throw ApiError.forbidden("Insufficient permissions");
    return ApiResponse.created(res, await UploadService.process(req.file, { tenantId: req.tenantId!, folder }));
  })
};
