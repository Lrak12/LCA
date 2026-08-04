// Student Monitoring endpoints (principal + teacher). Each hands off to the
// controller, which calls studentMonitoring.service. Mounted at /student-monitoring.
import { Router } from "express";
import * as StudentMonitoringController from "../controllers/studentMonitoring.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/",                    requireRole("principal", "teacher"), StudentMonitoringController.getOverview);        // list + stats
router.get("/pace-analytics",      requireRole("principal", "teacher"), StudentMonitoringController.getPaceAnalytics);   // analytics tab
router.get("/export",              requireRole("principal", "teacher"), StudentMonitoringController.exportRecords);     // wide-CSV records export
router.get("/:student_id/profile", requireRole("principal", "teacher"), StudentMonitoringController.getStudentProfile); // View Full Plan
router.get("/:student_id/summary", requireRole("principal", "teacher"), StudentMonitoringController.getStudentSummary); // View Student Details

export default router;


