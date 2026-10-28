import { Schema, model, Document, Types } from "mongoose";

export interface IToken extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  mint: string;
  symbol: string;
  name: string;
  description?: string;
  logoUrl?: string;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  launchDate?: Date;
  poolCreatedAt?: Date;
  pairAddress?: string;
  explorerUrl: string;
  socials: Record<string, string>;
  published: boolean;
  featured: boolean;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  authoritiesVerifiedAt?: Date;
  lastMarketData?: {
    price: number; change24h: number; marketCap: number; fdv: number; volume24h: number; liquidity: number;
    holders: number; source: string; refreshedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TokenSchema = new Schema<IToken>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    mint: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 4000 },
    logoUrl: String,
    decimals: { type: Number, default: 6, min: 0, max: 18 },
    totalSupply: { type: String, default: "0" },
    circulatingSupply: { type: String, default: "0" },
    launchDate: Date,
    poolCreatedAt: Date,
    pairAddress: String,
    explorerUrl: { type: String, default: "https://solscan.io/token/" },
    socials: { type: Map, of: String, default: {} },
    published: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    mintAuthorityRevoked: { type: Boolean, default: false },
    freezeAuthorityRevoked: { type: Boolean, default: false },
    authoritiesVerifiedAt: Date,
    lastMarketData: {
      price: Number, change24h: Number, marketCap: Number, fdv: Number, volume24h: Number, liquidity: Number,
      holders: Number, source: String, refreshedAt: Date
    }
  },
  { timestamps: true }
);

TokenSchema.index({ tenantId: 1, mint: 1 }, { unique: true });
TokenSchema.index({ tenantId: 1, published: 1, featured: -1 });
TokenSchema.index({ mint: 1 });

export const Token = model<IToken>("Token", TokenSchema);
