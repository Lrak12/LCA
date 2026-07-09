// ============================================================================
// FEATURE MAP - Student Monitoring   (BACKEND · LAYER 2 of 4: CONTROLLER)
// ----------------------------------------------------------------------------
// This is the backend for the Student Monitoring feature. The controller is a
// THIN layer between the route and the business logic: it reads the request
// (params/query), calls the matching SERVICE function, and sends the JSON reply.
// It contains no business rules - those live in the service.
//   Comes from:  studentMonitoring.routes.js
//   Goes next >  studentMonitoring.service.js  (then the model > Supabase DB)
// ============================================================================
import * as StudentMonitoringService from "../services/studentMonitoring.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

// Handles GET /student-monitoring. NEXT > service.getStudentMonitoring()
// (returns the full student list + summary stats for the page).
export const getOverview = asyncHandler(async (req, res) => {
  const data = await StudentMonitoringService.getStudentMonitoring();
  sendSuccess(res, data);
});

// Handles GET /student-monitoring/:id/profile. NEXT > service.getStudentProfile()
// (one student's full per-subject PACE grid, shown in the "View Full Plan" modal).
export const getStudentProfile = asyncHandler(async (req, res) => {
  const { student_id } = req.params;
  const data = await StudentMonitoringService.getStudentProfile(Number(student_id));
  sendSuccess(res, data);
});

// Handles GET /student-monitoring/pace-analytics. NEXT > service.getPaceAnalytics()
// (rankings + completion trend for the PACE Analytics tab).
export const getPaceAnalytics = asyncHandler(async (req, res) => {
  const data = await StudentMonitoringService.getPaceAnalytics();
  sendSuccess(res, data);
});

// Handles GET /student-monitoring/:id/summary. NEXT > service.getStudentSummary()
// (the compact "View Student Details" modal: identity + PACE progress + ranking).
export const getStudentSummary = asyncHandler(async (req, res) => {
  const { student_id } = req.params;
  const data = await StudentMonitoringService.getStudentSummary(Number(student_id));
  sendSuccess(res, data);
});

