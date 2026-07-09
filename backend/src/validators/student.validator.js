import { body } from "express-validator";

export const createStudentValidator = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("username").notEmpty().withMessage("Username is required"),
  body("first_name").notEmpty().withMessage("First name is required"),
  body("last_name").notEmpty().withMessage("Last name is required"),
  body("date_of_birth").isDate().withMessage("Valid date of birth is required"),
  body("gender").isIn(["Male", "Female"]).withMessage("Gender must be Male or Female"),
  body("address").notEmpty().withMessage("Address is required"),
  body("enrollment_date").isDate().withMessage("Valid enrollment date is required"),
];

export const updateStudentValidator = [
  body("first_name").optional().notEmpty().withMessage("First name cannot be empty"),
  body("last_name").optional().notEmpty().withMessage("Last name cannot be empty"),
  body("gender").optional().isIn(["Male", "Female"]).withMessage("Gender must be Male or Female"),
];
