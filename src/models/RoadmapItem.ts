import { Schema, model, Document, Types } from "mongoose";

export interface IRoadmapItem extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  phase: string;
  title: string;
  description: string;
  status: "planned" | "in_progress" | "completed" | "delayed" | "cancelled";
  when: string;
  evidence?: string;
  order: number;
  batch?: string;
}

const RoadmapItemSchema = new Schema<IRoadmapItem>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    phase: { type: String, required: true, maxlength: 40 },
    title: { type: String, required: true, maxlength: 140 },
    description: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ["planned", "in_progress", "completed", "delayed", "cancelled"], default: "planned" },
    when: { type: String, default: "" },
    evidence: String,
    order: { type: Number, default: 0 },
    batch: String
  },
  { timestamps: true }
);

RoadmapItemSchema.index({ tenantId: 1, order: 1 });

export const RoadmapItem = model<IRoadmapItem>("RoadmapItem", RoadmapItemSchema);
