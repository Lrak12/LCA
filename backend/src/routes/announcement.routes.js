import { Router } from "express";
import * as AnnouncementController from "../controllers/announcement.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/",       AnnouncementController.getAll);
router.get("/:id",    AnnouncementController.getById);
router.post("/",      requireRole("principal"), AnnouncementController.create);
router.put("/:id",    requireRole("principal"), AnnouncementController.update);
router.delete("/:id", requireRole("principal"), AnnouncementController.remove);

export default router;

