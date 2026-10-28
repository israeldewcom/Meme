import { Schema, model, Document, Types } from "mongoose";

export type MemeStatus = "draft" | "pending" | "approved" | "rejected" | "removed";

export interface IMeme extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  tokenId?: Types.ObjectId;
  uploaderId: Types.ObjectId;
  uploaderDisplayName: string;
  title: string;
  caption?: string;
  imageUrl: string;
  category: string;
  tags: string[];
  gradientFrom: string;
  gradientTo: string;
  status: MemeStatus;
  likes: number;
  shares: number;
  views: number;
  moderatedBy?: Types.ObjectId;
  moderationNote?: string;
  reportCount: number;
  challengeId?: Types.ObjectId;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MemeSchema = new Schema<IMeme>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    tokenId: { type: Schema.Types.ObjectId, ref: "Token" },
    uploaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploaderDisplayName: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 120, trim: true },
    caption: { type: String, maxlength: 500 },
    imageUrl: { type: String, required: true },
    category: {
      type: String,
      enum: ["classic", "reaction", "community", "launch", "art", "challenge", "other"],
      default: "classic"
    },
    tags: [{ type: String, trim: true, maxlength: 24 }],
    gradientFrom: { type: String, default: "#C6FF4D" },
    gradientTo: { type: String, default: "#4A8F1E" },
    status: { type: String, enum: ["draft", "pending", "approved", "rejected", "removed"], default: "pending" },
    likes: { type: Number, default: 0, min: 0 },
    shares: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    moderationNote: String,
    reportCount: { type: Number, default: 0 },
    challengeId: { type: Schema.Types.ObjectId, ref: "Challenge" },
    featured: { type: Boolean, default: false }
  },
  { timestamps: true }
);

MemeSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
MemeSchema.index({ tenantId: 1, status: 1, likes: -1 });
MemeSchema.index({ tenantId: 1, category: 1, status: 1 });
MemeSchema.index({ uploaderId: 1, createdAt: -1 });

export const Meme = model<IMeme>("Meme", MemeSchema);
