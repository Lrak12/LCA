import { Router } from "express";
import * as SectionController from "../controllers/section.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/",              requireRole("principal"), SectionController.getAll);
router.post("/:id/sections", requireRole("principal"), SectionController.createSection);
router.post("/:id/sections/:sectionId/students", requireRole("principal"), SectionController.assignSectionStudents);
router.delete("/:id/sections/:sectionId/students/:studentId", requireRole("principal"), SectionController.removeSectionStudent);
router.put("/:id/sections/:sectionId/teacher", requireRole("principal"), SectionController.assignSectionTeacher);
router.delete("/:id/sections/:sectionId/teacher", requireRole("principal"), SectionController.unassignSectionTeacher);
router.post("/:id/students", requireRole("principal"), SectionController.enrollStudents);
router.delete("/:id/students/:studentId", requireRole("principal"), SectionController.removeStudent);
router.post("/:id/teacher",  requireRole("principal"), SectionController.assignTeacher);
router.delete("/:id/teacher/:teacherId", requireRole("principal"), SectionController.unassignTeacher);
router.delete("/:id/teacher",            requireRole("principal"), SectionController.unassignTeacher);

export default router;
