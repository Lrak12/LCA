import * as ReportsService from "../services/reports.service.js";
import * as TeacherService from "../services/teacher.service.js";
import * as TeacherModel   from "../models/teacher.model.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getOverview = asyncHandler(async (req, res) => {
  const data = await ReportsService.getReportsOverview();
  sendSuccess(res, data);
});

export const getSchoolYears = asyncHandler(async (req, res) => {
  const data = await ReportsService.getSchoolYears();
  sendSuccess(res, data);
});

export const getTeachers = asyncHandler(async (req, res) => {
  const data = await ReportsService.getTeachers(req.query.sy_id);
  sendSuccess(res, data);
});

export const getTeacherAcademicReport = asyncHandler(async (req, res) => {
  const { teacher_id } = req.params;
  const quarter = parseInt(req.query.quarter, 10) || 4;
  const data = await ReportsService.getTeacherAcademicReport(Number(teacher_id), quarter, req.query.sy_id);
  sendSuccess(res, data);
});

export const getTeacherAttendanceReport = asyncHandler(async (req, res) => {
  const { teacher_id } = req.params;
  const quarter = parseInt(req.query.quarter, 10) || 4;
  const data = await ReportsService.getTeacherAttendanceReport(Number(teacher_id), quarter, req.query.sy_id);
  sendSuccess(res, data);
});

export const getTeacherPaceReport = asyncHandler(async (req, res) => {
  const { teacher_id } = req.params;
  const quarter = parseInt(req.query.quarter, 10) || 1;
  const data = await ReportsService.getTeacherPaceReport(Number(teacher_id), quarter, req.query.sy_id);
  sendSuccess(res, data);
});

export const getTeacherAnalyticsReport = asyncHandler(async (req, res) => {
  const quarter = parseInt(req.query.quarter, 10) || 4;
  const data = await TeacherService.getPaceAnalyticsReportForTeacher(
    Number(req.params.teacher_id),
    { quarter, sy_id: req.query.sy_id },
  );
  sendSuccess(res, data);
});

// ── Submission endpoints ──────────────────────────────────────────────────────

// Teacher: assign PACE projection for a student
export const assignPace = asyncHandler(async (req, res) => {
  const { student_id, paces } = req.body;
  if (!student_id || !paces || typeof paces !== "object")
    return res.status(400).json({ message: "student_id and paces object are required" });
  const { data: teacher } = await TeacherModel.findByUserId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.generatePaceProjection(teacher.teacher_id, student_id, paces);
  sendSuccess(res, data);
});

// Teacher: submit (or resubmit) a report for a given type + quarter
export const submitReport = asyncHandler(async (req, res) => {
  const { report_type, quarter } = req.body;
  if (!report_type || !quarter)
    return res.status(400).json({ message: "report_type and quarter are required" });
  const { data: teacher } = await TeacherModel.findByUserId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.submitReport(teacher.teacher_id, report_type, Number(quarter));
  sendSuccess(res, data);
});

// Teacher: get all submission statuses for the logged-in teacher (active school year)
export const getMySubmissionStatuses = asyncHandler(async (req, res) => {
  const { data: teacher } = await TeacherModel.findByUserId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.getTeacherAllStatuses(teacher.teacher_id);
  sendSuccess(res, data);
});

// Teacher: submitted/published reports for the Reports page table
export const getMySubmittedReports = asyncHandler(async (req, res) => {
  const { data: teacher } = await TeacherModel.findByUserId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.getSubmittedReports(teacher.teacher_id);
  sendSuccess(res, data);
});

// Principal: get submission statuses for all teachers for a given quarter + type
export const getSubmissionStatuses = asyncHandler(async (req, res) => {
  const { quarter, type } = req.query;
  if (!quarter && !type) {
    const data = await ReportsService.getAllSubmissionStatuses(req.query.sy_id);
    return sendSuccess(res, data);
  }
  if (!quarter || !type)
    return res.status(400).json({ message: "quarter and type are required" });
  const data = await ReportsService.getSubmissionStatuses(Number(quarter), type, req.query.sy_id);
  sendSuccess(res, data);
});
