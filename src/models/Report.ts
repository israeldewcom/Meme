import { Schema, model, Document, Types } from "mongoose";

export interface IReport extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  reporterId?: Types.ObjectId;
  reporterIp: string;
  targetType: "meme" | "challenge" | "user";
  targetId: Types.ObjectId;
  reason: "copyright" | "harassment" | "misinformation" | "spam" | "adult" | "other";
  details?: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  resolvedBy?: Types.ObjectId;
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterIp: { type: String, required: true },
    targetType: { type: String, enum: ["meme", "challenge", "user"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: ["copyright", "harassment", "misinformation", "spam", "adult", "other"], required: true },
    details: { type: String, maxlength: 2000 },
    status: { type: String, enum: ["open", "reviewing", "resolved", "dismissed"], default: "open" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolution: String
  },
  { timestamps: true }
);

ReportSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ReportSchema.index({ targetId: 1, reporterId: 1 });

export const Report = model<IReport>("Report", ReportSchema);
