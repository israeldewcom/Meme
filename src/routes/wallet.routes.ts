import { Router } from "express";
import { WalletController, challengeSchema, verifySchema } from "../controllers/walletController";
import { authLimiter } from "../middleware/rateLimiter";
import { validateBody } from "../middleware/validate";

const router = Router();
router.post("/challenge", authLimiter, validateBody(challengeSchema), WalletController.challenge);
router.post("/verify", authLimiter, validateBody(verifySchema), WalletController.verify);
export default router;
