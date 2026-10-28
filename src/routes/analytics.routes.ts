import { Router } from "express";
import { AnalyticsController, eventSchema } from "../controllers/analyticsController";
import { optionalAuth } from "../middleware/auth";
import { publicTenant } from "../middleware/tenant";
import { validateBody } from "../middleware/validate";
import { analyticsLimiter } from "../middleware/rateLimiter";

const router = Router();
router.post("/:slug/event", analyticsLimiter, publicTenant, optionalAuth, validateBody(eventSchema), AnalyticsController.record);
router.get("/:slug/overview", publicTenant, AnalyticsController.publicOverview);
export default router;
