import * as SupportService from "../services/userSupport.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { writeAudit } from "../services/audit.service.js";

export const getRequests = asyncHandler(async (req, res) => {
  const { search, category, status, page, pageSize } = req.query;
  const data = await SupportService.listSupportRequests({ search, category, status, page, pageSize });
  sendSuccess(res, data);
});

export const sendResetLink = asyncHandler(async (req, res) => {
  const sr_id = parseInt(req.params.sr_id, 10);
  const data = await SupportService.sendPasswordResetLink(sr_id);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "User Support",
    entity_id: sr_id,
    details: `Sent password reset link for ticket ${`SR-${String(sr_id).padStart(3, "0")}`}`,
  });
  sendSuccess(res, data, "Password reset link sent");
});

export const respondToRequest = asyncHandler(async (req, res) => {
  const sr_id = parseInt(req.params.sr_id, 10);
  const { response, status } = req.body;
  const data = await SupportService.respondToRequest(sr_id, { response, status });
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "User Support",
    entity_id: sr_id,
    details: `Updated ticket SR-${String(sr_id).padStart(3, "0")}${String(response ?? "").trim() ? " (responded)" : ""}`,
  });
  sendSuccess(res, data, "Request updated");
});

export const getPasswordResets = asyncHandler(async (req, res) => {
  const { search, status, page, pageSize } = req.query;
  const data = await SupportService.listPasswordResetRequests({ search, status, page, pageSize });
  sendSuccess(res, data);
});

export const processPasswordReset = asyncHandler(async (req, res) => {
  const sr_id = parseInt(req.params.sr_id, 10);
  const { action, note } = req.body;
  const data = await SupportService.processPasswordReset(sr_id, action, note);
  const labels = { temp: "Sent temporary password", link: "Sent password reset link", resolve: "Resolved request" };
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "Password Resets",
    entity_id: sr_id,
    details: `${labels[action] ?? "Processed"} for PR ${sr_id}`,
  });
  sendSuccess(res, data, "Request processed");
});
