import { Router } from "express";
import { ReferralController, trackSchema } from "../controllers/referralController";
import { requireAuth } from "../middleware/auth";
import { tenantGuard, publicTenant } from "../middleware/tenant";
import { validateBody } from "../middleware/validate";
import { referralTrackLimiter } from "../middleware/rateLimiter";

const router = Router();
router.get("/me/link", requireAuth, tenantGuard, ReferralController.myLink);
router.get("/me/stats", requireAuth, tenantGuard, ReferralController.myStats);
router.get("/leaderboard", requireAuth, tenantGuard, ReferralController.leaderboard);
router.post("/:slug/track", referralTrackLimiter, publicTenant, validateBody(trackSchema), ReferralController.track);
export default router;
