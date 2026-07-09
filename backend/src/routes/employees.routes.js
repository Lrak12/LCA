import { Router } from "express";
import * as EmployeesController from "../controllers/employees.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.get("/",                   requireRole("principal"), EmployeesController.getAll);
router.get("/stats",              requireRole("principal"), EmployeesController.getStats);
router.get("/supervisors",        requireRole("principal"), EmployeesController.getSupervisors);
router.get("/supervisors/stats",  requireRole("principal"), EmployeesController.getSupervisorStats);
router.post("/", requireRole("principal"), EmployeesController.createEmployee);


export default router;
