import { Schema, model, Document, Types } from "mongoose";

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  domain?: string;
  branding: {
    logoUrl?: string; primaryColor: string; secondaryColor: string; faviconUrl?: string; heroImage?: string;
    socialLinks?: Record<string, string>;
  };
  settings: {
    allowUserMemes: boolean; requireMemeApproval: boolean; maxMemeSizeMB: number; referralEnabled: boolean;
    telegramChatId?: string;
  };
  tokenDefaults: { network: string; explorer: string; decimals: number; mintAuthorityStatus: string; freezeAuthorityStatus: string };
  ownerId: Types.ObjectId;
  plan: "starter" | "pro" | "enterprise";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, match: /^[a-z0-9-]{2,40}$/ },
    domain: { type: String, lowercase: true },
    branding: {
      logoUrl: String,
      primaryColor: { type: String, default: "#C6FF4D", match: /^#[0-9A-Fa-f]{6}$/ },
      secondaryColor: { type: String, default: "#9A72FF", match: /^#[0-9A-Fa-f]{6}$/ },
      faviconUrl: String,
      heroImage: String,
      socialLinks: { type: Map, of: String, default: {} }
    },
    settings: {
      allowUserMemes: { type: Boolean, default: true },
      requireMemeApproval: { type: Boolean, default: true },
      maxMemeSizeMB: { type: Number, default: 8, min: 1, max: 20 },
      referralEnabled: { type: Boolean, default: true },
      telegramChatId: String
    },
    tokenDefaults: {
      network: { type: String, default: "Solana" },
      explorer: { type: String, default: "https://solscan.io/token/" },
      decimals: { type: Number, default: 6 },
      mintAuthorityStatus: { type: String, default: "unknown" },
      freezeAuthorityStatus: { type: String, default: "unknown" }
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["starter", "pro", "enterprise"], default: "starter" },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

TenantSchema.index({ domain: 1 }, { unique: true, partialFilterExpression: { domain: { $type: "string" } } });
TenantSchema.index({ active: 1, slug: 1 });

export const Tenant = model<ITenant>("Tenant", TenantSchema);
