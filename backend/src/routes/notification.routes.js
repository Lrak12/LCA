import { Router } from "express";
import * as NotificationController from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/",            NotificationController.getMine);
router.patch("/read-all",  NotificationController.markAllRead);   // before /:id/read
router.patch("/:id/read",  NotificationController.markRead);

export default router;
