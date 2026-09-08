import * as AnnouncementService from "../services/announcement.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await AnnouncementService.getAnnouncements(req.user.role);
  sendSuccess(res, data);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await AnnouncementService.getAnnouncementById(req.params.id);
  sendSuccess(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const data = await AnnouncementService.createAnnouncement(req.body, req.user);
  sendCreated(res, data, "Announcement posted");
});

export const update = asyncHandler(async (req, res) => {
  const data = await AnnouncementService.updateAnnouncement(req.params.id, req.body, req.user);
  sendSuccess(res, data, "Announcement updated");
});

export const remove = asyncHandler(async (req, res) => {
  await AnnouncementService.deleteAnnouncement(req.params.id);
  sendSuccess(res, null, "Announcement deleted");
});
