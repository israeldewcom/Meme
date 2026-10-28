import { z } from "zod";
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "invalid id");
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
/** https URL or an /uploads path. Blocks javascript:, data:, etc. */
export const safeUrl = z
  .string()
  .max(1000)
  .refine((s) => /^https:\/\//i.test(s) || /^\/uploads\//.test(s), "must be an https URL or /uploads path");
