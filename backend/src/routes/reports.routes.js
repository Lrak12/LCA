import { Router } from "express";
import * as ReportsController from "../controllers/reports.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("principal", "administrator"));

router.get("/",                                  ReportsController.getOverview);
router.get("/teachers",                          ReportsController.getTeachers);
router.get("/submissions",                       ReportsController.getSubmissionStatuses);
router.get("/teacher/:teacher_id/academic",      ReportsController.getTeacherAcademicReport);
router.get("/teacher/:teacher_id/attendance",    ReportsController.getTeacherAttendanceReport);
router.get("/teacher/:teacher_id/pace",          ReportsController.getTeacherPaceReport);

export default router;
