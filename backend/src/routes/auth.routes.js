import { Router } from "express";
import * as AuthController from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/login",  AuthController.login);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/contact-admin", AuthController.contactAdmin);
router.post("/reset-password", AuthController.resetPassword);
router.post("/logout", authenticate, AuthController.logout);
router.get("/me",      authenticate, AuthController.me);

export default router;
