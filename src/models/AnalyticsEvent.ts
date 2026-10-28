import { Schema, model, Document, Types } from "mongoose";

export type AnalyticsEventType = "visit" | "studio_session" | "export" | "meme_submit" | "challenge_entry" | "share" | "referral_share";

export interface IAnalyticsEvent extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  eventType: AnalyticsEventType;
  path?: string;
  ipHash: string;
  userId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    eventType: {
      type: String,
      enum: ["visit", "studio_session", "export", "meme_submit", "challenge_entry", "share", "referral_share"],
      required: true
    },
    path: { type: String, maxlength: 200 },
    ipHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnalyticsEventSchema.index({ tenantId: 1, eventType: 1, createdAt: -1 });
AnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const AnalyticsEvent = model<IAnalyticsEvent>("AnalyticsEvent", AnalyticsEventSchema);
