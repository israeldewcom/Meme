import { Schema, model, Document, Types } from "mongoose";

export interface IChallengeEntry { userId: Types.ObjectId; memeId?: Types.ObjectId; submittedAt: Date }

export interface IChallenge extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  title: string;
  description: string;
  status: "upcoming" | "live" | "ended";
  start: Date;
  end: Date;
  judging: string;
  prize: string;
  glyph: string;
  gradientFrom: string;
  gradientTo: string;
  rules: string[];
  entries: IChallengeEntry[];
  winners: Types.ObjectId[];
  resultsPublished: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: ["upcoming", "live", "ended"], default: "upcoming" },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    judging: { type: String, required: true, maxlength: 500 },
    prize: { type: String, required: true, maxlength: 500 },
    glyph: { type: String, default: "★", maxlength: 4 },
    gradientFrom: { type: String, default: "#C6FF4D" },
    gradientTo: { type: String, default: "#4A8F1E" },
    rules: [{ type: String, maxlength: 500 }],
    entries: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        memeId: { type: Schema.Types.ObjectId, ref: "Meme" },
        submittedAt: { type: Date, default: Date.now }
      }
    ],
    winners: [{ type: Schema.Types.ObjectId, ref: "User" }],
    resultsPublished: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

ChallengeSchema.index({ tenantId: 1, status: 1, end: -1 });
ChallengeSchema.index({ tenantId: 1, start: -1 });

export const Challenge = model<IChallenge>("Challenge", ChallengeSchema);
