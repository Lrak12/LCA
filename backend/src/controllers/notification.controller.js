import * as NotificationService from "../services/notification.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getMine = asyncHandler(async (req, res) => {
  const data = await NotificationService.getMyNotifications(req.user.user_id);
  sendSuccess(res, data);
});

export const markRead = asyncHandler(async (req, res) => {
  await NotificationService.markRead(Number(req.params.id), req.user.user_id);
  sendSuccess(res, null, "Marked as read");
});

export const markAllRead = asyncHandler(async (req, res) => {
  await NotificationService.markAllRead(req.user.user_id);
  sendSuccess(res, null, "All notifications marked as read");
});
