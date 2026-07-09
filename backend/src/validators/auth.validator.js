import { body } from "express-validator";

export const loginValidator = [
  body("id_number").notEmpty().withMessage("ID number is required"),
  body("password").notEmpty().withMessage("Password is required"),
];
