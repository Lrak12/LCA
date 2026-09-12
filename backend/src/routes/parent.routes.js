import { Router } from "express";
import * as ParentController from "../controllers/parent.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/dashboard", requireRole("parent"), ParentController.getDashboard);

export default router;
