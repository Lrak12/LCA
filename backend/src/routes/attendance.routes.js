import { Router } from "express";
import * as AttendanceController from "../controllers/attendance.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/",       requireRole("principal", "teacher", "student", "parent"), AttendanceController.getAll);
router.post("/",      requireRole("principal", "teacher"),                       AttendanceController.record);
router.put("/:id",    requireRole("principal", "teacher"),                       AttendanceController.update);
router.delete("/:id", requireRole("principal"),                                  AttendanceController.remove);

export default router;

