import asyncHandler from "../helpers/asyncHandler.js";
import { sendSuccess } from "../helpers/response.js";
import * as ParentService from "../services/parent.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await ParentService.getParentDashboard(req.user.user_id);
  sendSuccess(res, data);
});
