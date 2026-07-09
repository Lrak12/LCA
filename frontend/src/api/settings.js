import client from "./client.js";

export const fetchSettingsOverview  = ()            => client.get("/settings/overview");
export const fetchAcademicConfig    = ()            => client.get("/settings/academic");
export const updateSchoolYear       = (data)        => client.put("/settings/academic/school-year", data);
export const createGradeLevel       = (data)        => client.post("/settings/academic/grade-levels", data);
export const updateGradeLevel       = (id, data)    => client.put(`/settings/academic/grade-levels/${id}`, data);
export const deleteGradeLevel       = (id)          => client.delete(`/settings/academic/grade-levels/${id}`);
export const updateQuarters         = (data)        => client.put("/settings/academic/quarters", data);

// ── Principal account settings (own profile + password) ───────────────────────
export const fetchAccount           = ()            => client.get("/account");
export const updateAccount          = (data)        => client.put("/account", data);
export const changeAccountPassword  = (data)        => client.post("/account/password", data);
export const fetchSupportRequests    = ()            => client.get("/account/support-requests");
export const submitSupportRequest    = (data)        => client.post("/account/support-requests", data);