import { Router } from "express";
import { SuperController, createTenantSchema, updateTenantSchema } from "../controllers/superController";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody, validateObjectId } from "../middleware/validate";

const router = Router();
router.use(requireAuth, requireRole("super_admin"));
router.get("/tenants", SuperController.listTenants);
router.post("/tenants", validateBody(createTenantSchema), SuperController.createTenant);
router.patch("/tenants/:id", validateObjectId("id"), validateBody(updateTenantSchema), SuperController.updateTenant);
export default router;
