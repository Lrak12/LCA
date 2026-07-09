import { Router } from "express";
import * as TeacherController from "../controllers/teacher.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/",       requireRole("principal"),              TeacherController.getAll);
router.post("/",      requireRole("principal"),              TeacherController.create);
router.get("/:id",    requireRole("principal", "teacher"),   TeacherController.getById);
router.put("/:id",    requireRole("principal", "teacher"),   TeacherController.update);
router.delete("/:id", requireRole("principal"),              TeacherController.remove);

export default router;

