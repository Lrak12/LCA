import { Router } from "express";
import * as AccountController from "../controllers/account.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Signed-in principal's own account settings (profile + password).
router.use(authenticate, requireRole("principal"));

router.get("/",          AccountController.getAccount);
router.put("/",          AccountController.updateAccount);
router.post("/password", AccountController.changePassword);

router.get("/support-requests",  AccountController.getSupportRequests);
router.post("/support-requests", AccountController.createSupportRequest);

export default router;
