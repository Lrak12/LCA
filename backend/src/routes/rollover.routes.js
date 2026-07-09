import { Router } from "express";
import * as RolloverController from "../controllers/rollover.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/preview", requireRole("principal", "administrator"), RolloverController.preview);
router.post("/commit", requireRole("principal", "administrator"), RolloverController.commit);

export default router;
