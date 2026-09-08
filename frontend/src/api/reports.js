import client from "./client.js";

export const fetchReportsOverview = () => client.get("/reports");

export const fetchReportSchoolYears = () => client.get("/reports/school-years");

export const fetchReportTeachers = (sy_id) => client.get("/reports/teachers", { params: sy_id ? { sy_id } : {} });

export const fetchAcademicReport    = (teacher_id, quarter, sy_id) =>
  client.get(`/reports/teacher/${teacher_id}/academic`, { params: { quarter, ...(sy_id ? { sy_id } : {}) } });

export const fetchAttendanceReport  = (teacher_id, quarter, sy_id) =>
  client.get(`/reports/teacher/${teacher_id}/attendance`, { params: { quarter, ...(sy_id ? { sy_id } : {}) } });

export const fetchPaceReport        = (teacher_id, quarter, sy_id) =>
  client.get(`/reports/teacher/${teacher_id}/pace`, { params: { quarter, ...(sy_id ? { sy_id } : {}) } });

export const fetchAnalyticsReport   = (teacher_id, quarter, sy_id) =>
  client.get(`/reports/teacher/${teacher_id}/analytics`, { params: { quarter, ...(sy_id ? { sy_id } : {}) } });

// ── Submission (teacher) ──────────────────────────────────────────────────────

export const submitReport           = (report_type, quarter) =>
  client.post("/teacher/reports/submit", { report_type, quarter });

export const fetchMySubmissionStatuses = () =>
  client.get("/teacher/reports/statuses");

export const fetchMySubmittedReports = () =>
  client.get("/teacher/reports/submitted");

// ── Submission status (principal) ─────────────────────────────────────────────

export const fetchSubmissionStatuses = (quarter, type, sy_id) =>
  client.get("/reports/submissions", { params: { quarter, type, ...(sy_id ? { sy_id } : {}) } });

export const fetchAllSubmissionStatuses = (sy_id) =>
  client.get("/reports/submissions", { params: sy_id ? { sy_id } : {} });
