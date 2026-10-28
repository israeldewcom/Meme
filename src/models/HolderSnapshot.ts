import { Schema, model, Document, Types } from "mongoose";

export interface IHolderSnapshot extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  tokenId: Types.ObjectId;
  mint: string;
  totalHolders: number;
  holderCountIsSample: boolean;
  largestShare: number;
  top10Share: number;
  top20Share: number;
  denominator: string;
  source: string;
  topWallets: Array<{ address: string; balance: string; pct: number; change24h: number; tag?: string }>;
  capturedAt: Date;
}

const HolderSnapshotSchema = new Schema<IHolderSnapshot>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "Token", required: true },
    mint: { type: String, required: true },
    totalHolders: { type: Number, default: 0 },
    holderCountIsSample: { type: Boolean, default: false },
    largestShare: { type: Number, default: 0 },
    top10Share: { type: Number, default: 0 },
    top20Share: { type: Number, default: 0 },
    denominator: { type: String, default: "total supply" },
    source: { type: String, default: "unknown" },
    topWallets: [
      { _id: false, address: String, balance: String, pct: Number, change24h: { type: Number, default: 0 }, tag: String }
    ],
    capturedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

HolderSnapshotSchema.index({ tenantId: 1, tokenId: 1, capturedAt: -1 });
HolderSnapshotSchema.index({ tenantId: 1, mint: 1, capturedAt: -1 });
// Keep 30 days of snapshots
HolderSnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const HolderSnapshot = model<IHolderSnapshot>("HolderSnapshot", HolderSnapshotSchema);
