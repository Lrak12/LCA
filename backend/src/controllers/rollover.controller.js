import asyncHandler from "../helpers/asyncHandler.js";
import { sendSuccess } from "../helpers/response.js";
import * as RolloverService from "../services/rollover.service.js";

export const preview = asyncHandler(async (req, res) => {
  const data = await RolloverService.previewRollover();
  sendSuccess(res, data);
});

export const commit = asyncHandler(async (req, res) => {
  const data = await RolloverService.commitRollover(req.body);
  sendSuccess(res, data, "New school year started and projections generated");
});
