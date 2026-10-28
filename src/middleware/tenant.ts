import { Request, Response, NextFunction } from "express";
import { Tenant } from "../models/Tenant";
import { ApiError } from "../utils/ApiError";

/**
 * Authenticated tenant context. Normal users are pinned to the tenant in their token.
 * Only super_admin may select a tenant via x-tenant header / ?tenant=.
 * Must run AFTER requireAuth.
 */
export async function tenantGuard(req: Request, _res: Response, next: NextFunction) {
  try {
    let tenant: any = null;
    if (req.auth?.role === "super_admin") {
      const slug = (req.headers["x-tenant"] as string) || (req.query.tenant as string) || undefined;
      if (slug) tenant = await Tenant.findOne({ slug: String(slug).toLowerCase(), active: true }).lean();
      else if (req.auth.tenantId) tenant = await Tenant.findOne({ _id: req.auth.tenantId, active: true }).lean();
    } else if (req.auth?.tenantId) {
      tenant = await Tenant.findOne({ _id: req.auth.tenantId, active: true }).lean();
    }
    if (!tenant) return next(ApiError.notFound("Tenant not found or inactive"));
    req.tenantId = String(tenant._id);
    req.tenant = tenant;
    next();
  } catch (e) {
    next(e);
  }
}

/** Public tenant resolver (slug from route param, x-tenant header, or ?tenant=). */
export async function publicTenant(req: Request, _res: Response, next: NextFunction) {
  try {
    const slug = req.params.slug || (req.headers["x-tenant"] as string) || (req.query.tenant as string);
    if (!slug || typeof slug !== "string") return next(ApiError.badRequest("Tenant slug required"));
    const tenant = await Tenant.findOne({ slug: slug.toLowerCase(), active: true }).lean();
    if (!tenant) return next(ApiError.notFound("Tenant not found"));
    req.tenantId = String(tenant._id);
    req.tenant = tenant;
    next();
  } catch (e) {
    next(e);
  }
}
