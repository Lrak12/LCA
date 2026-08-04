// Thin controllers for Student Monitoring: read the request, call the service, send JSON.
import * as StudentMonitoringService from "../services/studentMonitoring.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

// full student list + summary stats
export const getOverview = asyncHandler(async (req, res) => {
  const data = await StudentMonitoringService.getStudentMonitoring();
  sendSuccess(res, data);
});

// one student's per-subject PACE grid (View Full Plan modal)
export const getStudentProfile = asyncHandler(async (req, res) => {
  const { student_id } = req.params;
  const data = await StudentMonitoringService.getStudentProfile(Number(student_id));
  sendSuccess(res, data);
});

// rankings + completion trend for the PACE Analytics tab
export const getPaceAnalytics = asyncHandler(async (req, res) => {
  const data = await StudentMonitoringService.getPaceAnalytics();
  sendSuccess(res, data);
});

// compact View Student Details modal (identity + progress + ranking)
export const getStudentSummary = asyncHandler(async (req, res) => {
  const { student_id } = req.params;
  const data = await StudentMonitoringService.getStudentSummary(Number(student_id));
  sendSuccess(res, data);
});

// wide-CSV export: every student's profile + grades + summaries ({ headers, rows })
export const exportRecords = asyncHandler(async (req, res) => {
  const data = await StudentMonitoringService.exportStudentRecords();
  sendSuccess(res, data);
});

