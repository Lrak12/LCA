import * as SectionService from "../services/section.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await SectionService.getAllGradeLevels();
  sendSuccess(res, data);
});

export const enrollStudents = asyncHandler(async (req, res) => {
  const { student_ids } = req.body;
  const data = await SectionService.enrollStudents(req.params.id, student_ids);
  sendSuccess(res, data, `${data.enrolled} student(s) enrolled`);
});

export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacher_id } = req.body;
  const data = await SectionService.assignTeacher(req.params.id, teacher_id);
  sendSuccess(res, data, "Teacher assigned to grade level");
});
