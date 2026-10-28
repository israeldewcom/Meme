import { Router } from "express";
import { ChallengeController, createChallengeSchema, enterSchema, endSchema } from "../controllers/challengeController";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middleware/auth";
import { tenantGuard } from "../middleware/tenant";
import { validateBody, validateObjectId } from "../middleware/validate";

const router = Router();
router.use(requireAuth, tenantGuard);
router.post("/", requireRole(...ADMIN_ROLES.config), validateBody(createChallengeSchema), ChallengeController.create);
router.get("/", ChallengeController.list);
router.post("/:id/enter", validateObjectId("id"), validateBody(enterSchema), ChallengeController.enter);
router.patch("/:id/end", validateObjectId("id"), requireRole(...ADMIN_ROLES.config), validateBody(endSchema), ChallengeController.end);
export default router;
