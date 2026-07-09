import * as AdminUsersService from "../services/adminUsers.service.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";
import { writeAudit } from "../services/audit.service.js";

export const getUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page, pageSize } = req.query;
  const data = await AdminUsersService.listUsers({ search, role, status, page, pageSize });
  sendSuccess(res, data);
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);
  const { is_active } = req.body;
  const data = await AdminUsersService.setUserActive(user_id, !!is_active);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "User Management",
    entity_id: user_id,
    details: `${is_active ? "Activated" : "Deactivated"} user account #${user_id}`,
  });
  sendSuccess(res, data, "User status updated");
});

export const createUser = asyncHandler(async (req, res) => {
  const data = await AdminUsersService.createUser(req.body);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "CREATE",
    entity_affected: "User Management",
    entity_id: data.user_id,
    details: `Created new user account: ${data.first_name} ${data.last_name}`,
  });
  sendCreated(res, data, "User created");
});

export const updateUser = asyncHandler(async (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);
  const data = await AdminUsersService.updateUser(user_id, req.body);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "User Management",
    entity_id: user_id,
    details: `Updated user account #${user_id}${req.body?.password ? " (password reset)" : ""}`,
  });
  sendSuccess(res, data, "User updated");
});

export const getRolePermissions = asyncHandler(async (req, res) => {
  const data = await AdminUsersService.listRolePermissions();
  sendSuccess(res, data);
});

export const updateRolePermission = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { is_active } = req.body;
  const data = await AdminUsersService.setRoleActive(role, !!is_active);
  await writeAudit({
    user_id: req.user?.user_id,
    action: "UPDATE",
    entity_affected: "User Permissions",
    details: `${is_active ? "Activated" : "Deactivated"} all ${data.role} accounts`,
  });
  sendSuccess(res, data, "Role status updated");
});
