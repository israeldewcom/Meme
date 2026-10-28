import { Schema, model, Document, Types } from "mongoose";

export interface IAllocation extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  tokenId: Types.ObjectId;
  name: string;
  percentage: number;
  amount: string;
  vesting: string;
  color: string;
  order: number;
  batch?: string;
}

const AllocationSchema = new Schema<IAllocation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "Token", required: true },
    name: { type: String, required: true, maxlength: 60 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    amount: { type: String, default: "0" },
    vesting: { type: String, default: "", maxlength: 500 },
    color: { type: String, default: "#C6FF4D", match: /^#[0-9A-Fa-f]{6}$/ },
    order: { type: Number, default: 0 },
    batch: String
  },
  { timestamps: true }
);

AllocationSchema.index({ tenantId: 1, tokenId: 1, order: 1 });

export const Allocation = model<IAllocation>("Allocation", AllocationSchema);
