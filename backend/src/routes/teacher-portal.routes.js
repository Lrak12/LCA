import { Router } from "express";
import * as TeacherController from "../controllers/teacher.controller.js";
import * as ReportsController  from "../controllers/reports.controller.js";
import * as AccountController  from "../controllers/account.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate); // every /teacher/* route below requires a logged-in user
// GET /teacher/dashboard - supervisor home page data. NEXT > controller.getDashboard
//   > service.getTeacherDashboard. UI: pages/teacher/TeacherDashboard.jsx.
router.get("/dashboard",        requireRole("teacher"), TeacherController.getDashboard);
router.get("/students",         requireRole("teacher"), TeacherController.getStudents);
// GET /teacher/pace-monitoring - PACE Monitoring page data. NEXT > controller.getPaceMonitoring.
router.get("/pace-monitoring",  requireRole("teacher"), TeacherController.getPaceMonitoring);
router.get("/assessments",        requireRole("teacher"), TeacherController.getAssessments);
router.get("/student-monitoring", requireRole("teacher"), TeacherController.getStudentMonitoring);
router.get("/student-monitoring-overview", requireRole("teacher"), TeacherController.getStudentMonitoringOverview);
router.get("/pace-analytics-overview", requireRole("teacher"), TeacherController.getPaceAnalyticsOverview);
router.get("/student-rankings", requireRole("teacher"), TeacherController.getStudentRankings);
router.get("/pace-analytics-report", requireRole("teacher"), TeacherController.getPaceAnalyticsReport);

// Signed-in supervisor's own account settings (profile + password + contact admin)
router.get("/account",                   requireRole("teacher"), AccountController.getAccount);
router.put("/account",                   requireRole("teacher"), AccountController.updateAccount);
router.post("/account/password",         requireRole("teacher"), AccountController.changePassword);
router.post("/account/email/request-code", requireRole("teacher"), AccountController.requestEmailChange);
router.post("/account/email/verify",       requireRole("teacher"), AccountController.verifyEmailChange);
router.get("/account/support-requests",  requireRole("teacher"), AccountController.getSupportRequests);
router.post("/account/support-requests", requireRole("teacher"), AccountController.createSupportRequest);
router.get("/student-record",     requireRole("teacher"), TeacherController.getStudentAcademicRecord);
router.post("/student-record/note", requireRole("teacher"), TeacherController.saveSupervisorNote);
router.post("/student-record/remarks", requireRole("teacher"), TeacherController.saveAcademicRemarks);   // Bible Memory + Reading WPM
router.post("/student-record/ready-next", requireRole("teacher"), TeacherController.markReadyForNext);
router.patch("/student-record/:id/profile", requireRole("teacher"), TeacherController.updateStudentProfile); // supervisor edits student info
router.patch("/student-record/grade", requireRole("teacher"), TeacherController.setPaceScore);              // inline grade edit
// GET /teacher/attendance  - load a day's roster + saved status. NEXT > controller.getAttendance
router.get("/attendance",         requireRole("teacher"), TeacherController.getAttendance);
// POST /teacher/attendance - save the day's records.         NEXT > controller.submitAttendance
router.post("/attendance",        requireRole("teacher"), TeacherController.submitAttendance);

router.get("/assessments/self-test/results",      requireRole("teacher"), TeacherController.getExistingSelfTestResults);
router.get("/assessments/self-test/pace-numbers", requireRole("teacher"), TeacherController.getSelfTestPaceNumbers);
router.post("/assessments/self-test/bulk",        requireRole("teacher"), TeacherController.bulkSaveSelfTest);
router.get("/assessments/pace-test/results",      requireRole("teacher"), TeacherController.getExistingPaceTestResults);
router.post("/assessments/pace-test/bulk",        requireRole("teacher"), TeacherController.bulkSavePaceTest);
router.post("/reports/submit",      requireRole("teacher"), ReportsController.submitReport);
router.get("/reports/statuses",     requireRole("teacher"), ReportsController.getMySubmissionStatuses);
router.get("/reports/submitted",    requireRole("teacher"), ReportsController.getMySubmittedReports);
router.get("/reports/attendance",     requireRole("teacher"), TeacherController.getMyAttendanceReport);
router.get("/reports/pace-progress",  requireRole("teacher"), TeacherController.getMyPaceProgressReport);
router.get("/reports/academic",       requireRole("teacher"), TeacherController.getMyAcademicReport);
router.get("/pace-projection",   requireRole("teacher"), TeacherController.getPaceProjection);
router.get("/last-completed-paces", requireRole("teacher"), TeacherController.getLastCompletedPaces);
router.patch("/pace-projection/cell",   requireRole("teacher"), TeacherController.updatePaceCell);
router.patch("/pace-projection/status", requireRole("teacher"), TeacherController.updatePaceStatus);
router.post("/assign-pace",      requireRole("teacher"), ReportsController.assignPace);

router.get("/returning-students",     requireRole("teacher"), TeacherController.getReturningStudents);
router.get("/student-pace-manage",    requireRole("teacher"), TeacherController.getStudentPaceManage);
router.post("/student-pace-manage",   requireRole("teacher"), TeacherController.saveStudentPace);
// Record Assessments page (teacher/Assessments.jsx). NEXT > the matching controller > service.
router.get("/record-assessments",     requireRole("teacher"), TeacherController.getStudentAssessments); // load one student's PACEs + attempts
router.post("/record-assessments/self-test", requireRole("teacher"), TeacherController.recordSelfTest);  // add a self-test attempt
router.post("/record-assessments/self-test/reset", requireRole("teacher"), TeacherController.resetSelfTest); // clear attempts to re-record
router.post("/record-assessments/pace-test", requireRole("teacher"), TeacherController.recordPaceTest);  // add a pace-test attempt
router.get("/pace-test-scheduling",   requireRole("teacher"), TeacherController.getPaceTestScheduling);
router.get("/scheduled-tests",        requireRole("teacher"), TeacherController.getScheduledTests);
router.get("/pace-test-schedule",     requireRole("teacher"), TeacherController.getPaceTestSchedule);
router.post("/pace-test-schedule",    requireRole("teacher"), TeacherController.schedulePaceTest);
router.patch("/pace-test-schedule/:id",  requireRole("teacher"), TeacherController.updatePaceTestSchedule);
router.delete("/pace-test-schedule/:id", requireRole("teacher"), TeacherController.cancelPaceTest);

export default router;
