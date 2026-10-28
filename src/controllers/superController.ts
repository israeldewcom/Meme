import { Request, Response } from "express";
import { z } from "zod";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { ReferralLink } from "../models/Referral";
import { AuditLog } from "../models/AuditLog";
import { AuthService } from "../services/authService";
import { invalidateBootstrap } from "../services/cache";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { generateReferralCode } from "../utils/crypto";
import { parsePaging } from "../utils/paging";

export const createTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(12).max(128),
  ownerDisplayName: z.string().min(2).max(60)
});
export const updateTenantSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  plan: z.enum(["starter", "pro", "enterprise"]).optional(),
  active: z.boolean().optional()
});

export const SuperController = {
  createTenant: asyncHandler(async (req: Request, res: Response) => {
    const b = req.body as z.infer<typeof createTenantSchema>;
    if (await Tenant.exists({ slug: b.slug })) throw ApiError.conflict("Slug already taken");

    const owner = await User.create({
      email: b.ownerEmail.toLowerCase(),
      passwordHash: await AuthService.hashPassword(b.ownerPassword),
      displayName: b.ownerDisplayName,
      role: "tenant_admin",
      referralCode: generateReferralCode()
    });
    try {
      const tenant = await Tenant.create({ name: b.name, slug: b.slug, plan: b.plan, ownerId: owner._id });
      owner.tenantId = tenant._id;
      await owner.save();
      await ReferralLink.create({ tenantId: tenant._id, userId: owner._id, code: owner.referralCode });
      await AuditLog.create({ tenantId: tenant._id, actorId: req.auth!.userId, action: "tenant.created", entity: "Tenant", entityId: String(tenant._id) });
      return ApiResponse.created(res, { id: String(tenant._id), slug: tenant.slug, ownerId: String(owner._id) });
    } catch (e) {
      await User.deleteOne({ _id: owner._id }); // don't leave an orphan owner behind
      throw e;
    }
  }),

  listTenants: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePaging(req.query, 50, 100);
    const [items, total] = await Promise.all([
      Tenant.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select("name slug plan active createdAt").lean(),
      Tenant.countDocuments()
    ]);
    return ApiResponse.paginated(res, items, page, limit, total);
  }),

  updateTenant: asyncHandler(async (req: Request, res: Response) => {
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!tenant) throw ApiError.notFound("Tenant not found");
    await AuditLog.create({ tenantId: tenant._id, actorId: req.auth!.userId, action: "tenant.updated", entity: "Tenant", entityId: String(tenant._id), metadata: req.body });
    await invalidateBootstrap(tenant.slug);
    return ApiResponse.ok(res, { id: String(tenant._id), name: tenant.name, plan: tenant.plan, active: tenant.active });
  })
};
