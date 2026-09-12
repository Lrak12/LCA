import * as AuthService from "../services/auth.service.js";
import * as UserSupportService from "../services/userSupport.service.js";
import { sendSuccess, sendError } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { writeAudit } from "../services/audit.service.js";

export const login = asyncHandler(async (req, res) => {
  const { id_number, password } = req.body;
  const { data, role, username, user_id, id_number: idNum, first_name, last_name } = await AuthService.login(id_number, password);

  await writeAudit({
    user_id,
    action: "LOGIN",
    entity_affected: "Authentication",
    details: "User logged in to the system",
  });

  sendSuccess(res, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id,
      user_id,
      id_number: idNum,
      email: data.user.email,
      username,
      role,
      first_name,
      last_name,
    },
  }, "Login successful");
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { id_number, new_password } = req.body;
  await AuthService.resetPasswordBySchoolId(id_number, new_password);
  sendSuccess(res, null, "Password updated successfully. You can now log in.");
});

// Complete a reset started from a Supabase recovery-email link (token + new password).
export const resetPasswordWithToken = asyncHandler(async (req, res) => {
  const { access_token, new_password } = req.body;
  await AuthService.resetPasswordWithToken(access_token, new_password);
  sendSuccess(res, null, "Password updated successfully. You can now log in.");
});

// Public: user submits only their ID number to request a password reset
export const forgotPassword = asyncHandler(async (req, res) => {
  const { id_number } = req.body;
  if (!id_number || !String(id_number).trim()) {
    return sendError(res, "Please enter your ID number.", 400);
  }
  const result = await UserSupportService.requestPasswordReset(String(id_number).trim());
  sendSuccess(res, result, "Password reset request submitted.");
});

// Public: user submits a support request from the Contact Administrator page
export const contactAdmin = asyncHandler(async (req, res) => {
  const { full_name, id_number, reason, message } = req.body;
  if (!id_number || !String(id_number).trim()) {
    return sendError(res, "Please enter your ID number.", 400);
  }
  const result = await UserSupportService.createContactRequest({
    id_number: String(id_number).trim(),
    full_name,
    reason,
    message,
  });
  sendSuccess(res, result, "Your request has been submitted.");
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  // Write while the authenticated user is still available. The frontend clears
  // its local session even if remote sign-out fails, so this records the user's
  // explicit logout action reliably before the access token is invalidated.
  await writeAudit({
    user_id: req.user.user_id,
    action: "LOGOUT",
    entity_affected: "Authentication",
    details: "User logged out of the system",
  });

  await AuthService.logout(token);
  sendSuccess(res, null, "Logged out successfully");
});

const ROLE_PROFILE = {
  student:       { table: "student",       pk: "student_id"   },
  parent:        { table: "parent",        pk: "parent_id"    },
  teacher:       { table: "teacher",       pk: "teacher_id"   },
  principal:     { table: "principal",     pk: "principal_id" },
  administrator: { table: "administrator", pk: "admin_id"     },
};

export const me = asyncHandler(async (req, res) => {
  const cfg = ROLE_PROFILE[req.user.role];
  if (cfg) {
    const { data: profile } = await supabaseAdmin
      .from(cfg.table)
      .select(`${cfg.pk}, first_name, last_name`)
      .eq("user_id", req.user.user_id)
      .single();
    return sendSuccess(res, {
      ...req.user,
      id_number:  profile?.[cfg.pk] ?? null,
      first_name: profile?.first_name ?? null,
      last_name:  profile?.last_name  ?? null,
    });
  }
  sendSuccess(res, req.user);
});
