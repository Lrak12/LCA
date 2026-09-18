import * as SectionService from "../services/section.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await SectionService.getAllGradeLevels();
  sendSuccess(res, data);
});

export const enrollStudents = asyncHandler(async (req, res) => {
  const { student_ids } = req.body;
  const data = await SectionService.enrollStudents(req.params.id, student_ids, req.user?.user_id);
  sendSuccess(res, data, `${data.enrolled} student(s) enrolled`);
});

export const removeStudent = asyncHandler(async (req, res) => {
  const data = await SectionService.removeStudent(req.params.id, req.params.studentId);
  sendSuccess(res, data, "Student removed from grade level");
});

export const assignTeacher = asyncHandler(async (req, res) => {
  const { teacher_id } = req.body;
  const data = await SectionService.assignTeacher(req.params.id, teacher_id, req.user?.user_id);
  sendSuccess(res, data, "Teacher assigned to grade level");
});

export const unassignTeacher = asyncHandler(async (req, res) => {
  const data = await SectionService.unassignTeacher(req.params.id, req.params.teacherId);
  sendSuccess(res, data, "Supervisor removed from grade level");
});

export const createSection = asyncHandler(async (req, res) => {
  const data = await SectionService.createGradeSection(req.params.id, req.body.name);
  sendSuccess(res, data, "Section created");
});

export const assignSectionStudents = asyncHandler(async (req, res) => {
  const data = await SectionService.assignStudentsToGradeSection(req.params.id, req.params.sectionId, req.body.student_ids, req.user?.user_id);
  sendSuccess(res, data, `${data.assigned} student(s) assigned to section`);
});

export const removeSectionStudent = asyncHandler(async (req, res) => {
  const data = await SectionService.removeStudentFromGradeSection(req.params.id, req.params.sectionId, req.params.studentId, req.user?.user_id);
  sendSuccess(res, data, "Student removed from section");
});

export const assignSectionTeacher = asyncHandler(async (req, res) => {
  const data = await SectionService.assignGradeSectionTeacher(req.params.id, req.params.sectionId, req.body.teacher_id, req.user?.user_id);
  sendSuccess(res, data, "Supervisor assigned to section");
});

export const unassignSectionTeacher = asyncHandler(async (req, res) => {
  const data = await SectionService.unassignGradeSectionTeacher(req.params.id, req.params.sectionId, req.user?.user_id);
  sendSuccess(res, data, "Supervisor removed from section");
});
