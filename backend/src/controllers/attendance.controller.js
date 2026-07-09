import * as AttendanceService from "../services/attendance.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const { student_id, teacher_id, date } = req.query;
  const data = await AttendanceService.getAttendance({ student_id, teacher_id, date });
  sendSuccess(res, data);
});

export const record = asyncHandler(async (req, res) => {
  const data = await AttendanceService.recordAttendance(req.body, req.user);
  sendCreated(res, data, "Attendance recorded");
});

export const update = asyncHandler(async (req, res) => {
  const data = await AttendanceService.updateAttendance(req.params.id, req.body);
  sendSuccess(res, data, "Attendance updated");
});

export const remove = asyncHandler(async (req, res) => {
  await AttendanceService.deleteAttendance(req.params.id);
  sendSuccess(res, null, "Attendance record deleted");
});
