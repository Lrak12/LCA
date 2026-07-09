// ============================================================================
// FEATURE MAP - Student Monitoring   (BACKEND · LAYER 1 of 4: ROUTES)
// ----------------------------------------------------------------------------
// This is the backend for the Student Monitoring feature. This first layer just
// defines the HTTP endpoints and guards them with auth + role checks. It does NO
// logic itself - each request is handed to the CONTROLLER next:
//   route (this file) > studentMonitoring.controller.js > studentMonitoring.service.js > studentMonitoring.model.js (Supabase DB)
// Frontend caller: frontend/src/api/studentMonitoring.js
// (used by the principal Student Monitoring page + View Student Details modal).
// All endpoints are mounted under "/student-monitoring" (see routes/index.js).
// ============================================================================
import { Router } from "express";
import * as StudentMonitoringController from "../controllers/studentMonitoring.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate); // every route below requires a logged-in user
// GET /student-monitoring            > the full student list + stats  > controller.getOverview
router.get("/",                    requireRole("principal", "teacher"), StudentMonitoringController.getOverview);
// GET /student-monitoring/pace-analytics > PACE Analytics & Rankings tab > controller.getPaceAnalytics
router.get("/pace-analytics",      requireRole("principal", "teacher"), StudentMonitoringController.getPaceAnalytics);
// GET /student-monitoring/:id/profile    > one student's full PACE grid  > controller.getStudentProfile
router.get("/:student_id/profile", requireRole("principal", "teacher"), StudentMonitoringController.getStudentProfile);
// GET /student-monitoring/:id/summary    > "View Student Details" modal  > controller.getStudentSummary
router.get("/:student_id/summary", requireRole("principal", "teacher"), StudentMonitoringController.getStudentSummary);

export default router;


