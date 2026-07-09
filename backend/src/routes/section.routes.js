import { Router } from "express";
import * as SectionController from "../controllers/section.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/",              requireRole("principal"), SectionController.getAll);
router.post("/:id/students", requireRole("principal"), SectionController.enrollStudents);
router.post("/:id/teacher",  requireRole("principal"), SectionController.assignTeacher);

export default router;

