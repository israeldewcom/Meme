import { Router } from "express";
import { MemeController, memeCreateSchema, moderateSchema, reportSchema } from "../controllers/memeController";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { tenantGuard } from "../middleware/tenant";
import { validateBody, validateObjectId } from "../middleware/validate";
import { uploadLimiter, reportLimiter } from "../middleware/rateLimiter";

const router = Router();
router.use(requireAuth, tenantGuard);

router.get("/", MemeController.listApproved);
router.get("/mine", MemeController.listMine);
router.get("/pending", requireRole(...ADMIN_ROLES.moderate), MemeController.listPending);
router.post("/", uploadLimiter, validateBody(memeCreateSchema), MemeController.create);
router.patch("/:id/moderate", validateObjectId("id"), requireRole(...ADMIN_ROLES.moderate), validateBody(moderateSchema), MemeController.moderate);
router.post("/:id/like", validateObjectId("id"), MemeController.like);
router.delete("/:id/like", validateObjectId("id"), MemeController.unlike);
router.post("/:id/share", validateObjectId("id"), MemeController.share);
router.post("/:id/report", validateObjectId("id"), reportLimiter, validateBody(reportSchema), MemeController.report);
export default router;
