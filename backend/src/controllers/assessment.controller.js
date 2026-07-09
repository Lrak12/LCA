import * as AssessmentService from "../services/assessment.service.js";
import * as ReportsService from "../services/reports.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getCheckUps = asyncHandler(async (req, res) => {
  const data = await AssessmentService.getCheckUpsByPace(req.params.spId);
  sendSuccess(res, data);
});

export const recordCheckUp = asyncHandler(async (req, res) => {
  const data = await AssessmentService.recordCheckUp(req.body, req.user);
  sendCreated(res, data, "Check-up recorded");
});

export const updateCheckUp = asyncHandler(async (req, res) => {
  const data = await AssessmentService.updateCheckUp(req.params.id, req.body);
  sendSuccess(res, data, "Check-up updated");
});

export const getSelfTest = asyncHandler(async (req, res) => {
  const data = await AssessmentService.getSelfTestByPace(req.params.spId);
  sendSuccess(res, data);
});

export const recordSelfTest = asyncHandler(async (req, res) => {
  const data = await AssessmentService.recordSelfTest(req.body);
  sendCreated(res, data, "Self-test recorded");
});

export const getPaceTest = asyncHandler(async (req, res) => {
  const data = await AssessmentService.getPaceTestByPace(req.params.spId);
  sendSuccess(res, data);
});

export const recordPaceTest = asyncHandler(async (req, res) => {
  const data = await AssessmentService.recordPaceTest(req.body, req.user);
  sendCreated(res, data, "PACE test recorded");
});

// ─── Diagnostic Assessments ───────────────────────────────────────────────────

export const getDiagnostics = asyncHandler(async (req, res) => {
  const data = req.query.student_id
    ? await AssessmentService.getDiagnosticsByStudent(req.query.student_id)
    : await AssessmentService.getAllDiagnostics();
  sendSuccess(res, data);
});

export const createDiagnostic = asyncHandler(async (req, res) => {
  const data = await AssessmentService.createDiagnostic(req.body, req.user);
  sendCreated(res, data, "Diagnostic assessment created");
});

export const updateDiagnostic = asyncHandler(async (req, res) => {
  const data = await AssessmentService.updateDiagnostic(req.params.id, req.body);
  sendSuccess(res, data, "Diagnostic assessment updated");
});

export const generateProjection = asyncHandler(async (req, res) => {
  const { student_id, paces } = req.body;
  const data = await ReportsService.generateDiagnosticProjection(student_id, paces);
  sendCreated(res, data, "Projected PACE plan generated");
});
