import { Router } from "express";
import multer from "multer";
import { UploadController } from "../controllers/uploadController";
import { requireAuth } from "../middleware/auth";
import { tenantGuard } from "../middleware/tenant";
import { uploadLimiter } from "../middleware/rateLimiter";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!env.UPLOAD_ALLOWED_MIME.includes(file.mimetype)) return cb(ApiError.badRequest(`Unsupported mime type: ${file.mimetype}`));
    cb(null, true);
  }
});

const router = Router();
router.post("/", requireAuth, tenantGuard, uploadLimiter, upload.single("file"), UploadController.single);
export default router;
