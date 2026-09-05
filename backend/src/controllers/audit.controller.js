import * as AuditService from "../services/audit.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { search, action, from, to, page, pageSize } = req.query;
  const data = await AuditService.listAuditLogs({ search, action, from, to, page, pageSize });
  sendSuccess(res, data);
});
