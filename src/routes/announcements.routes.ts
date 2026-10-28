import { Router } from "express";
import { AnnouncementController, createAnnouncementSchema } from "../controllers/announcementController";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { tenantGuard } from "../middleware/tenant";
import { validateBody, validateObjectId } from "../middleware/validate";

const router = Router();
router.use(requireAuth, tenantGuard);
router.post("/", requireRole(...ADMIN_ROLES.edit), validateBody(createAnnouncementSchema), AnnouncementController.create);
router.get("/", AnnouncementController.list);
router.delete("/:id", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), AnnouncementController.remove);
export default router;
