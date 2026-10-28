import { Router } from "express";
import {
  AdminController, brandingSchema, tokenConfigSchema, tokenUpdateSchema, tokenomicsSchema, roadmapSchema,
  resolveReportSchema, teamUpdateSchema
} from "../controllers/adminController";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { tenantGuard } from "../middleware/tenant";
import { validateBody, validateObjectId } from "../middleware/validate";

const router = Router();
router.use(requireAuth, tenantGuard, requireRole(...ADMIN_ROLES.all));

router.get("/overview", AdminController.overview);
router.patch("/branding", requireRole(...ADMIN_ROLES.edit), validateBody(brandingSchema), AdminController.updateBranding);

router.get("/tokens", AdminController.listTokens);
router.post("/tokens", requireRole(...ADMIN_ROLES.config), validateBody(tokenConfigSchema), AdminController.createToken);
router.patch("/tokens/:id", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), validateBody(tokenUpdateSchema), AdminController.updateToken);
router.post("/tokens/:id/verify", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), AdminController.verifyToken);
router.patch("/tokens/:id/publish", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), AdminController.setPublished(true));
router.patch("/tokens/:id/unpublish", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), AdminController.setPublished(false));
router.patch("/tokens/:id/feature", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), AdminController.featureToken);

router.get("/tokenomics", AdminController.getTokenomics);
router.put("/tokenomics", requireRole(...ADMIN_ROLES.config), validateBody(tokenomicsSchema), AdminController.setTokenomics);

router.get("/roadmap", AdminController.getRoadmap);
router.put("/roadmap", requireRole(...ADMIN_ROLES.edit), validateBody(roadmapSchema), AdminController.setRoadmap);

router.get("/integrations", AdminController.integrations);
router.post("/integrations/:id/test", requireRole(...ADMIN_ROLES.config), AdminController.testIntegration);

router.get("/audit-log", requireRole(...ADMIN_ROLES.config), AdminController.auditLog);

router.get("/reports", requireRole(...ADMIN_ROLES.moderate), AdminController.listReports);
router.patch("/reports/:id", validateObjectId("id"), requireRole(...ADMIN_ROLES.moderate), validateBody(resolveReportSchema), AdminController.resolveReport);

router.get("/team", requireRole(...ADMIN_ROLES.config), AdminController.listTeam);
router.patch("/team/:userId", validateObjectId("userId"), requireRole(...ADMIN_ROLES.config), validateBody(teamUpdateSchema), AdminController.updateTeamMember);

router.get("/analytics", requireRole(...ADMIN_ROLES.analytics), AdminController.analytics);
router.get("/referrals", requireRole(...ADMIN_ROLES.analytics), AdminController.referralSummary);
router.delete("/referrals/:code", requireRole(...ADMIN_ROLES.config), AdminController.disableReferralCode);

export default router;
