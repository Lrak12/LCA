import { Router } from "express";
import * as PaceController from "../controllers/pace.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/modules",        PaceController.getAllModules);
router.get("/modules/:id",    PaceController.getModuleById);
router.post("/modules",       requireRole("principal"),              PaceController.createModule);
router.put("/modules/:id",    requireRole("principal"),              PaceController.updateModule);
router.delete("/modules/:id", requireRole("principal"),              PaceController.deleteModule);

router.get("/",                        requireRole("principal", "teacher"),           PaceController.getAllStudentPaces);
router.get("/student/:studentId",      requireRole("principal", "teacher", "student", "parent"), PaceController.getPacesByStudent);
router.post("/",                       requireRole("principal", "teacher"),           PaceController.assignPace);
router.get("/:id",                     requireRole("principal", "teacher", "student", "parent"), PaceController.getStudentPaceById);
router.put("/:id",                     requireRole("principal", "teacher"),           PaceController.updatePaceStatus);
router.delete("/:id",                  requireRole("principal"),                      PaceController.deletePace);

export default router;

