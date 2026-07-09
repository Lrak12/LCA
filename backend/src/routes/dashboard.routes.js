import { Router } from "express";
import * as DashboardController from "../controllers/dashboard.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/stats", requireRole("principal"), DashboardController.getStats);
router.get("/admin", requireRole("administrator"), DashboardController.getAdminStats);

export default router;
