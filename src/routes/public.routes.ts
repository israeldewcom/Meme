import { Router } from "express";
import { bootstrap, listMemesPublic, listChallengesPublic, listAnnouncementsPublic, getTokenomics, getRoadmap } from "../controllers/publicController";
import { MarketController, historyQuery } from "../controllers/marketController";
import { publicTenant } from "../middleware/tenant";
import { validateQuery } from "../middleware/validate";

const router = Router();
router.get("/:slug/bootstrap", bootstrap);
router.get("/:slug/memes", publicTenant, listMemesPublic);
router.get("/:slug/challenges", publicTenant, listChallengesPublic);
router.get("/:slug/announcements", publicTenant, listAnnouncementsPublic);
router.get("/:slug/tokenomics", publicTenant, getTokenomics);
router.get("/:slug/roadmap", publicTenant, getRoadmap);
router.get("/:slug/market/:mint", publicTenant, MarketController.getLive);
router.get("/:slug/market/:mint/history", publicTenant, validateQuery(historyQuery), MarketController.getHistory);
router.get("/:slug/holders/:mint", publicTenant, MarketController.getHolders);
export default router;
