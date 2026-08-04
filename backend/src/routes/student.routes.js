import { Router } from "express";
import * as StudentController from "../controllers/student.controller.js";
import * as AccountController from "../controllers/account.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Signed-in student's own account settings (profile + password + contact admin)
router.get("/account",                   requireRole("student"), AccountController.getAccount);
router.put("/account",                   requireRole("student"), AccountController.updateAccount);
router.post("/account/password",         requireRole("student"), AccountController.changePassword);
router.post("/account/email/request-code", requireRole("student"), AccountController.requestEmailChange);
router.post("/account/email/verify",       requireRole("student"), AccountController.verifyEmailChange);
router.get("/account/support-requests",  requireRole("student"), AccountController.getSupportRequests);
router.post("/account/support-requests", requireRole("student"), AccountController.createSupportRequest);
router.get("/dashboard", requireRole("student"), StudentController.getDashboard);
router.get("/pace",        requireRole("student"), StudentController.getPace);
router.post("/pace/test-request", requireRole("student"), StudentController.requestPaceTest);
router.get("/assessments", requireRole("student"), StudentController.getAssessments);
router.get("/grades",      requireRole("student"), StudentController.getGrades);
router.get("/attendance",    requireRole("student"), StudentController.getAttendance);
router.get("/announcements",    requireRole("student"), StudentController.getAnnouncements);
router.get("/settings",         requireRole("student"), StudentController.getSettings);
router.put("/settings/profile",  requireRole("student"), StudentController.updateProfile);
router.put("/settings/email",    requireRole("student"), StudentController.updateEmail);
router.put("/settings/password", requireRole("student"), StudentController.changePassword);
router.get("/",           requireRole("principal", "teacher"), StudentController.getAll);
router.post("/",          requireRole("principal"),            StudentController.create);
router.post("/import",    requireRole("principal"),            StudentController.importStudents);
router.get("/:id",        requireRole("principal", "teacher", "student", "parent"), StudentController.getById);
router.put("/:id",       requireRole("principal"),            StudentController.update);
router.patch("/:id",     requireRole("principal", "teacher"), StudentController.patchInfo);
router.delete("/:id",    requireRole("principal"),            StudentController.remove);
router.post("/:id/parents", requireRole("principal"),         StudentController.linkParent);


export default router;

