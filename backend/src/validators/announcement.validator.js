import { body } from "express-validator";

export const announcementValidator = [
  body("title").notEmpty().withMessage("Title is required"),
  body("content").notEmpty().withMessage("Content is required"),
  body("audience_role")
    .isIn(["All", "Student", "Teacher", "Parent", "Admin"])
    .withMessage("Invalid audience role"),
];
