import { body } from "express-validator";

export const attendanceValidator = [
  body("student_id").isInt().withMessage("Valid student ID is required"),
  body("date_recorded").isDate().withMessage("Valid date is required"),
  body("status").isIn(["Present", "Absent", "Late"]).withMessage("Status must be Present, Absent, or Late"),
  body("remarks").optional().isString(),
];
