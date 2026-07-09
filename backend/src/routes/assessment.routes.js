import { Router } from "express";
import * as AssessmentController from "../controllers/assessment.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/checkup/:spId",    requireRole("principal", "teacher", "student", "parent"), AssessmentController.getCheckUps);
router.post("/checkup",         requireRole("principal", "teacher"),                       AssessmentController.recordCheckUp);
router.put("/checkup/:id",      requireRole("principal", "teacher"),                       AssessmentController.updateCheckUp);

router.get("/selftest/:spId",   requireRole("principal", "teacher", "student", "parent"), AssessmentController.getSelfTest);
router.post("/selftest",        requireRole("principal", "teacher"),                       AssessmentController.recordSelfTest);

router.get("/pacetest/:spId",   requireRole("principal", "teacher", "student", "parent"), AssessmentController.getPaceTest);
router.post("/pacetest",        requireRole("principal", "teacher"),                       AssessmentController.recordPaceTest);

router.get("/diagnostic",       requireRole("principal", "teacher"),                       AssessmentController.getDiagnostics);
router.post("/diagnostic",      requireRole("principal", "teacher"),                       AssessmentController.createDiagnostic);
router.put("/diagnostic/:id",   requireRole("principal"),                                  AssessmentController.updateDiagnostic);
router.post("/diagnostic/generate-projection", requireRole("principal"),                   AssessmentController.generateProjection);

export default router;

