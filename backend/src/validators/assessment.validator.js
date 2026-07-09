import { body } from "express-validator";

export const checkUpValidator = [
  body("sp_id").isInt().withMessage("Valid PACE ID is required"),
  body("attempt_number").isInt({ min: 1 }).withMessage("Attempt number must be a positive integer"),
  body("score").isFloat({ min: 0, max: 100 }).withMessage("Score must be between 0 and 100"),
  body("date_taken").isDate().withMessage("Valid date is required"),
];

export const selfTestValidator = [
  body("selftest_id").isInt().withMessage("Valid PACE ID is required"),
  body("score").isFloat({ min: 0, max: 100 }).withMessage("Score must be between 0 and 100"),
  body("date_taken").isDate().withMessage("Valid date is required"),
];

export const paceTestValidator = [
  body("pacetest_id").isInt().withMessage("Valid PACE ID is required"),
  body("score").isFloat({ min: 0, max: 100 }).withMessage("Score must be between 0 and 100"),
  body("date_taken").isDate().withMessage("Valid date is required"),
];
