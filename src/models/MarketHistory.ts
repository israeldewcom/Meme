import { Schema, model, Document, Types } from "mongoose";

export interface IMarketHistory extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  tokenId: Types.ObjectId;
  mint: string;
  range: string;
  points: Array<{ t: number; p: number }>;
  source: string;
  isDemo: boolean;
  refreshedAt: Date;
}

const MarketHistorySchema = new Schema<IMarketHistory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "Token", required: true },
    mint: { type: String, required: true },
    range: { type: String, required: true },
    points: [{ _id: false, t: Number, p: Number }],
    source: { type: String, required: true },
    isDemo: { type: Boolean, default: false },
    refreshedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

MarketHistorySchema.index({ tenantId: 1, tokenId: 1, range: 1 }, { unique: true });
MarketHistorySchema.index({ mint: 1, range: 1 });
MarketHistorySchema.index({ refreshedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const MarketHistory = model<IMarketHistory>("MarketHistory", MarketHistorySchema);
