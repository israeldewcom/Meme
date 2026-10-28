import { Schema, model, Document, Types } from "mongoose";

export interface IAnnouncement extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  body: string;
  tone: "lime" | "violet" | "cyan" | "amber" | "red";
  pinned: boolean;
  authorId: Types.ObjectId;
  publishedAt: Date;
  expiresAt?: Date;
  telegramQueued: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 4000 },
    tone: { type: String, enum: ["lime", "violet", "cyan", "amber", "red"], default: "lime" },
    pinned: { type: Boolean, default: false },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    telegramQueued: { type: Boolean, default: false }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ tenantId: 1, pinned: -1, publishedAt: -1 });

export const Announcement = model<IAnnouncement>("Announcement", AnnouncementSchema);
