import client from "./client.js";

// Admin dashboard data (dashboard.service.getAdminDashboard)
export const fetchAdminDashboard = () => client.get("/dashboard/admin");

export const fetchUsers = (params = {}) => client.get("/admin/users", { params });

export const setUserActive = (user_id, is_active) =>
  client.patch(`/admin/users/${user_id}/status`, { is_active });

export const createUser = (payload) => client.post("/admin/users", payload);

export const updateUser = (user_id, payload) => client.put(`/admin/users/${user_id}`, payload);

export const fetchSchoolYears   = () => client.get("/admin/school-years");
export const createSchoolYear   = (payload) => client.post("/admin/school-years", payload);
export const updateSchoolYear   = (sy_id, payload) => client.put(`/admin/school-years/${sy_id}`, payload);
export const activateSchoolYear = (sy_id) => client.post(`/admin/school-years/${sy_id}/activate`);

export const fetchSchoolConfig = () => client.get("/admin/school-config");

export const saveSchoolConfig = (payload) => client.put("/admin/school-config", payload);

export const fetchRolePermissions = () => client.get("/admin/permissions");

export const setRoleActive = (role, is_active) =>
  client.patch(`/admin/permissions/${role}`, { is_active });

export const fetchAuditLogs = (params = {}) => client.get("/admin/audit-logs", { params });

export const fetchSupportRequests = (params = {}) => client.get("/admin/support-requests", { params });

export const sendSupportResetLink = (sr_id) =>
  client.post(`/admin/support-requests/${sr_id}/reset-link`, {});

export const respondToSupportRequest = (sr_id, payload) =>
  client.put(`/admin/support-requests/${sr_id}`, payload);

export const fetchPasswordResets = (params = {}) => client.get("/admin/password-resets", { params });

export const processPasswordReset = (sr_id, payload) =>
  client.post(`/admin/password-resets/${sr_id}/process`, payload);

export const fetchAccount = () => client.get("/admin/account");

export const updateAccount = (payload) => client.put("/admin/account", payload);

export const changeAccountPassword = (payload) => client.post("/admin/account/password", payload);
