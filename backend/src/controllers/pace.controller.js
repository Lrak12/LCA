import * as PaceService from "../services/pace.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAllStudentPaces = asyncHandler(async (req, res) => {
  const data = await PaceService.getAllStudentPaces();
  sendSuccess(res, data);
});

export const getStudentPaceById = asyncHandler(async (req, res) => {
  const data = await PaceService.getStudentPaceById(req.params.id);
  sendSuccess(res, data);
});

export const getPacesByStudent = asyncHandler(async (req, res) => {
  const data = await PaceService.getPacesByStudent(req.params.studentId);
  sendSuccess(res, data);
});

export const assignPace = asyncHandler(async (req, res) => {
  const data = await PaceService.assignPace(req.body, req.user);
  sendCreated(res, data, "PACE assigned successfully");
});

export const updatePaceStatus = asyncHandler(async (req, res) => {
  const data = await PaceService.updatePaceStatus(req.params.id, req.body);
  sendSuccess(res, data, "PACE updated successfully");
});

export const deletePace = asyncHandler(async (req, res) => {
  await PaceService.deletePace(req.params.id);
  sendSuccess(res, null, "PACE record deleted");
});

export const getAllModules = asyncHandler(async (req, res) => {
  const data = await PaceService.getAllModules(req.query.gl_id);
  sendSuccess(res, data);
});

export const getModuleById = asyncHandler(async (req, res) => {
  const data = await PaceService.getModuleById(req.params.id);
  sendSuccess(res, data);
});

export const createModule = asyncHandler(async (req, res) => {
  const data = await PaceService.createModule(req.body);
  sendCreated(res, data, "Module created successfully");
});

export const updateModule = asyncHandler(async (req, res) => {
  const data = await PaceService.updateModule(req.params.id, req.body);
  sendSuccess(res, data, "Module updated successfully");
});

export const deleteModule = asyncHandler(async (req, res) => {
  await PaceService.deleteModule(req.params.id);
  sendSuccess(res, null, "Module deleted");
});
