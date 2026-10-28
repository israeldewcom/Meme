import dotenv from "dotenv";
import { z } from "zod";
import { parseBool } from "../utils/bool";

dotenv.config();

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      try {
        return parseBool(v, def);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be true or false" });
        return z.NEVER;
      }
    });
const str = (def = "") => z.string().optional().default(def);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().default(4000),
  API_VERSION: z.string().default("v1"),
  LOG_LEVEL: z.string().default("info"),
  TRUST_PROXY: z.coerce.number().default(1),
  DEMO_MODE: bool(false),

  PUBLIC_SITE_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: str(""),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default("meme_launchpad_pro"),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  JWT_WALLET_CHALLENGE_TTL: z.string().default("5m"),

  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_NETWORK: z.string().default("mainnet-beta"),
  SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  BIRDEYE_API_KEY: str(),
  DEXSCREENER_API_URL: z.string().url().default("https://api.dexscreener.com"),

  UPLOAD_PROVIDER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("./public/uploads"),
  LOCAL_UPLOAD_PUBLIC_URL: z.string().default("/uploads"),
  S3_ENDPOINT: str(),
  S3_REGION: str("us-east-1"),
  S3_BUCKET: str(),
  S3_ACCESS_KEY: str(),
  S3_SECRET_KEY: str(),
  S3_PUBLIC_BASE_URL: str(),
  UPLOAD_MAX_MB: z.coerce.number().default(8),
  UPLOAD_ALLOWED_MIME: z.string().default("image/png,image/jpeg,image/webp"),
  UPLOAD_IMAGE_MAX_WIDTH: z.coerce.number().default(2048),

  TELEGRAM_BOT_TOKEN: str(),
  TELEGRAM_ENABLED: bool(true),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(180),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  REFERRAL_TRACK_MAX: z.coerce.number().default(60),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  PRICE_REFRESH_INTERVAL_MS: z.coerce.number().default(30000),
  HOLDER_SNAPSHOT_INTERVAL_MS: z.coerce.number().default(300000),
  MARKET_HISTORY_INTERVAL_MS: z.coerce.number().default(120000),
  CLEANUP_INTERVAL_MS: z.coerce.number().default(3600000),

  ENABLE_TELEGRAM_WORKER: bool(true),
  ENABLE_PRICE_WORKER: bool(true),
  ENABLE_HOLDER_WORKER: bool(true),
  ENABLE_HISTORY_WORKER: bool(true),
  ENABLE_CLEANUP_WORKER: bool(true),

  BOOTSTRAP_ADMIN_EMAIL: str(),
  BOOTSTRAP_ADMIN_PASSWORD: str(),
  BOOTSTRAP_TENANT_SLUG: str(),
  BOOTSTRAP_TENANT_NAME: str("Demo")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

const d = parsed.data;

if (d.NODE_ENV === "production") {
  const problems: string[] = [];
  if (/change_?me/i.test(d.JWT_SECRET) || /change_?me/i.test(d.JWT_REFRESH_SECRET)) problems.push("JWT secrets still contain CHANGE_ME");
  if (d.JWT_SECRET === d.JWT_REFRESH_SECRET) problems.push("JWT_SECRET and JWT_REFRESH_SECRET must differ");
  if (d.UPLOAD_PROVIDER === "s3" && (!d.S3_BUCKET || !d.S3_PUBLIC_BASE_URL)) problems.push("S3_BUCKET and S3_PUBLIC_BASE_URL required for s3 uploads");
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error("Unsafe production configuration:\n - " + problems.join("\n - "));
    process.exit(1);
  }
}

export const env = {
  ...d,
  CORS_ORIGINS: d.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  UPLOAD_ALLOWED_MIME: d.UPLOAD_ALLOWED_MIME.split(",").map((s) => s.trim()).filter(Boolean)
};
