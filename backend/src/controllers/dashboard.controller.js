import * as DashboardService from "../services/dashboard.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getStats = asyncHandler(async (req, res) => {
  const data = await DashboardService.getDashboardStats();
  sendSuccess(res, data);
});

export const getAdminStats = asyncHandler(async (req, res) => {
  const data = await DashboardService.getAdminDashboard();
  sendSuccess(res, data);
});