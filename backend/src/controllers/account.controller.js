import * as AccountService from "../services/account.service.js";
import * as UserSupportService from "../services/userSupport.service.js";
import * as EmailVerificationService from "../services/emailVerification.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { writeAudit } from "../services/audit.service.js";

export const getAccount = asyncHandler(async (req, res) => {
  const data = await AccountService.getAccount(req.user.user_id);
  sendSuccess(res, data);
});

export const updateAccount = asyncHandler(async (req, res) => {
  const data = await AccountService.updateAccount(req.user.user_id, req.body);
  await writeAudit({
    user_id: req.user.user_id,
    action: "UPDATE",
    entity_affected: "Account Settings",
    details: "Updated own profile information",
  });
  sendSuccess(res, data, "Profile updated");
});

export const changePassword = asyncHandler(async (req, res) => {
  await AccountService.changePassword(req.user.user_id, req.body);
  await writeAudit({
    user_id: req.user.user_id,
    action: "UPDATE",
    entity_affected: "Account Settings",
    details: "Changed own account password",
  });
  sendSuccess(res, null, "Password updated");
});

// Step 1 of an email change: Supabase emails a verification code to the new address.
export const requestEmailChange = asyncHandler(async (req, res) => {
  const accessToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const data = await EmailVerificationService.requestEmailChange(accessToken, req.body.newEmail);
  sendSuccess(res, data, "Verification code sent");
});

// Step 2: confirm the code and apply the new email.
export const verifyEmailChange = asyncHandler(async (req, res) => {
  const data = await EmailVerificationService.verifyEmailChange(req.body.newEmail, req.body.code);
  await writeAudit({
    user_id: req.user.user_id,
    action: "UPDATE",
    entity_affected: "Account Settings",
    details: "Changed own email address (verified by code)",
  });
  sendSuccess(res, data, "Email updated");
});

export const getSupportRequests = asyncHandler(async (req, res) => {
  const data = await UserSupportService.listRequestsForUser(req.user.user_id);
  sendSuccess(res, data);
});

export const createSupportRequest = asyncHandler(async (req, res) => {
  const data = await UserSupportService.createRequestForUser(req.user.user_id, req.body);
  sendCreated(res, data, "Support request submitted");
});
