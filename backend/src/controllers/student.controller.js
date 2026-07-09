import * as StudentService from "../services/student.service.js";
import { sendSuccess, sendCreated, sendError } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await StudentService.getAllStudents();
  sendSuccess(res, data);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentById(req.params.id);
  sendSuccess(res, data);
});

export const create = asyncHandler(async (req, res) => {
  // Pull out auth credentials, the optional parent/guardian contact, the active
  // flag, and any fields with no column on the student table (e.g. middle_name)
  // so only real student columns reach the insert.
  const { email, password, username, parent, is_active, middle_name, ...profile } = req.body;
  void middle_name;
  const data = await StudentService.createStudent(
    { email, password, username },
    profile,
    { parentContact: parent, is_active },
  );
  sendCreated(res, data, "Student created successfully");
});

export const update = asyncHandler(async (req, res) => {
  const data = await StudentService.updateStudent(req.params.id, req.body);
  sendSuccess(res, data, "Student updated successfully");
});

export const patchInfo = asyncHandler(async (req, res) => {
  const data = await StudentService.patchStudentInfo(req.params.id, req.body, req.user);
  sendSuccess(res, data, "Student updated successfully");
});

export const remove = asyncHandler(async (req, res) => {
  await StudentService.deleteStudent(req.params.id);
  sendSuccess(res, null, "Student deleted successfully");
});

export const linkParent = asyncHandler(async (req, res) => {
  const { parent_id, is_primary_contact } = req.body;
  const data = await StudentService.linkParent(req.params.id, parent_id, is_primary_contact);
  sendCreated(res, data, "Parent linked successfully");
});

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentDashboard(req.user.user_id);
  sendSuccess(res, data);
});

export const getSettings = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentSettings(req.user.user_id);
  sendSuccess(res, data);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { first_name, last_name } = req.body;
  const data = await StudentService.updateStudentProfile(req.user.user_id, { first_name, last_name });
  sendSuccess(res, data, "Profile updated successfully");
});

export const updateEmail = asyncHandler(async (req, res) => {
  const { newEmail } = req.body;
  const data = await StudentService.updateStudentEmail(req.user.user_id, { newEmail });
  sendSuccess(res, data, "Email updated successfully");
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await StudentService.changeStudentPassword(req.user.user_id, { currentPassword, newPassword });
  sendSuccess(res, null, "Password changed successfully");
});

export const getAnnouncements = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentAnnouncements(req.user.user_id);
  sendSuccess(res, data);
});

export const getAttendance = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentAttendance(req.user.user_id, req.query.month);
  sendSuccess(res, data);
});

export const getGrades = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentGrades(req.user.user_id, req.query.quarter);
  sendSuccess(res, data);
});

export const getAssessments = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentAssessments(req.user.user_id);
  sendSuccess(res, data);
});

export const getPace = asyncHandler(async (req, res) => {
  const data = await StudentService.getStudentPace(req.user.user_id);
  sendSuccess(res, data);
});

export const requestPaceTest = asyncHandler(async (req, res) => {
  const data = await StudentService.submitPaceTestRequest(req.user.user_id, req.body.sp_id);
  sendCreated(res, data);
});

export const importStudents = asyncHandler(async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return sendError(res, "No student data provided", 400);
  }
  const result = await StudentService.importStudents(students);
  sendSuccess(res, result, `${result.imported} student(s) imported successfully`);
});