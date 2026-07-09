import { Router } from "express";
import * as Settings from "../controllers/settings.controller.js";

const router = Router();

router.get("/overview",                     Settings.getOverview);
router.get("/academic",                     Settings.getAcademicConfig);
router.post("/academic/grade-levels",       Settings.addGradeLevel);
router.put("/academic/grade-levels/:id",    Settings.editGradeLevel);
router.delete("/academic/grade-levels/:id", Settings.removeGradeLevel);
router.put("/academic/school-year", Settings.updateSchoolYear);
export default router;