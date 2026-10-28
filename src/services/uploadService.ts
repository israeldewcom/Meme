import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface UploadResult { url: string; key: string; width: number; height: number; mime: string; bytes: number }

const s3 =
  env.UPLOAD_PROVIDER === "s3"
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        forcePathStyle: !!env.S3_ENDPOINT
      })
    : null;

const FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" }
};

export class UploadService {
  static async process(file: Express.Multer.File, opts: { tenantId: string; folder: string }): Promise<UploadResult> {
    if (!file) throw ApiError.badRequest("No file provided");
    if (file.size > env.UPLOAD_MAX_MB * 1024 * 1024) throw ApiError.badRequest(`File exceeds ${env.UPLOAD_MAX_MB}MB`);

    // Trust the bytes, not the declared mimetype.
    let format: string | undefined;
    try {
      format = (await sharp(file.buffer, { limitInputPixels: 40_000_000 }).metadata()).format;
    } catch {
      throw ApiError.badRequest("File is not a valid image");
    }
    const spec = format ? FORMATS[format] : undefined;
    if (!spec || !env.UPLOAD_ALLOWED_MIME.includes(spec.mime)) throw ApiError.badRequest("Unsupported image type");

    // Re-encode: strips metadata (EXIF/GPS) and neutralises polyglot payloads.
    let pipeline = sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: env.UPLOAD_IMAGE_MAX_WIDTH, withoutEnlargement: true, fit: "inside" });
    pipeline =
      format === "jpeg" ? pipeline.jpeg({ quality: 86, mozjpeg: true })
      : format === "webp" ? pipeline.webp({ quality: 86 })
      : pipeline.png({ compressionLevel: 9 });
    const processed = await pipeline.toBuffer({ resolveWithObject: true });

    const key = `${opts.tenantId}/${opts.folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${spec.ext}`;
    const base = {
      key,
      width: processed.info.width,
      height: processed.info.height,
      mime: spec.mime,
      bytes: processed.info.size
    };

    if (s3) {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: processed.data,
          ContentType: spec.mime,
          CacheControl: "public, max-age=31536000, immutable"
        })
      );
      return { ...base, url: `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}` };
    }

    const full = path.join(env.LOCAL_UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, processed.data);
    return { ...base, url: `${env.LOCAL_UPLOAD_PUBLIC_URL.replace(/\/$/, "")}/${key}` };
  }
}
