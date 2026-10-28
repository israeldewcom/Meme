import { Router } from "express";
import { AuthController, registerSchema, loginSchema, refreshSchema } from "../controllers/authController";
import { validateBody } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();
router.post("/register", authLimiter, validateBody(registerSchema), AuthController.register);
router.post("/login", authLimiter, validateBody(loginSchema), AuthController.login);
router.post("/refresh", authLimiter, validateBody(refreshSchema), AuthController.refresh);
router.post("/logout", validateBody(refreshSchema), AuthController.logout);
router.post("/logout-all", requireAuth, AuthController.logoutAll);
router.get("/me", requireAuth, AuthController.me);
export default router;
