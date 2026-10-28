import { Schema, model, Document, Types } from "mongoose";

export type ReferralEventType = "visit" | "qualified" | "conversion" | "share";

export interface IReferralEvent extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  referrerId: Types.ObjectId;
  code: string;
  eventType: ReferralEventType;
  ipHash: string;
  userAgent?: string;
  referrer?: string;
  qualified: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ReferralEventSchema = new Schema<IReferralEvent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, required: true, uppercase: true },
    eventType: { type: String, enum: ["visit", "qualified", "conversion", "share"], required: true },
    ipHash: { type: String, required: true },
    userAgent: String,
    referrer: String,
    qualified: { type: Boolean, default: false },
    metadata: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ReferralEventSchema.index({ tenantId: 1, code: 1, createdAt: -1 });
ReferralEventSchema.index({ tenantId: 1, referrerId: 1, eventType: 1 });
ReferralEventSchema.index({ tenantId: 1, ipHash: 1, createdAt: -1 });
ReferralEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const ReferralEvent = model<IReferralEvent>("ReferralEvent", ReferralEventSchema);

export interface IReferralLink extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  code: string;
  campaign?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralLinkSchema = new Schema<IReferralLink>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, required: true, uppercase: true },
    campaign: String
  },
  { timestamps: true }
);

ReferralLinkSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
ReferralLinkSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const ReferralLink = model<IReferralLink>("ReferralLink", ReferralLinkSchema);
