import { Schema, model, Types } from "mongoose";

const MemeLikeSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    memeId: { type: Schema.Types.ObjectId, ref: "Meme", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
MemeLikeSchema.index({ memeId: 1, userId: 1 }, { unique: true });

export interface IMemeLike { tenantId: Types.ObjectId; memeId: Types.ObjectId; userId: Types.ObjectId }
export const MemeLike = model<IMemeLike>("MemeLike", MemeLikeSchema);
