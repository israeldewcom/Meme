import { Schema, model, Document, Types } from "mongoose";
import { UserRole } from "../types";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email?: string;
  passwordHash?: string;
  wallet?: string;
  displayName: string;
  role: UserRole;
  tenantId: Types.ObjectId | null;
  avatarUrl?: string;
  referralCode?: string;
  referredBy?: Types.ObjectId;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  active: boolean;
  banned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, lowercase: true, trim: true },
    passwordHash: String,
    wallet: String,
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    role: {
      type: String,
      enum: ["super_admin", "tenant_admin", "admin", "editor", "moderator", "analyst", "member"],
      default: "member"
    },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    avatarUrl: String,
    referralCode: { type: String },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastLoginAt: Date,
    lastLoginIp: String,
    active: { type: Boolean, default: true },
    banned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, role: 1 });
// Partial indexes: wallet-only users (no email) and email-only users must not collide on null.
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
UserSchema.index({ tenantId: 1, wallet: 1 }, { unique: true, partialFilterExpression: { wallet: { $type: "string" } } });
UserSchema.index({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: "string" } } });

export const User = model<IUser>("User", UserSchema);
