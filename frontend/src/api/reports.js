import client from "./client.js";

export const fetchReportsOverview = () => client.get("/reports");

export const fetchReportTeachers = () => client.get("/reports/teachers");

export const fetchAcademicReport    = (teacher_id, quarter) =>
  client.get(`/reports/teacher/${teacher_id}/academic?quarter=${quarter}`);

export const fetchAttendanceReport  = (teacher_id, quarter) =>
  client.get(`/reports/teacher/${teacher_id}/attendance?quarter=${quarter}`);

export const fetchPaceReport        = (teacher_id, quarter) =>
  client.get(`/reports/teacher/${teacher_id}/pace?quarter=${quarter}`);

// ── Submission (teacher) ──────────────────────────────────────────────────────

export const submitReport           = (report_type, quarter) =>
  client.post("/teacher/reports/submit", { report_type, quarter });

export const fetchMySubmissionStatuses = () =>
  client.get("/teacher/reports/statuses");

export const fetchMySubmittedReports = () =>
  client.get("/teacher/reports/submitted");

// ── Submission status (principal) ─────────────────────────────────────────────

export const fetchSubmissionStatuses = (quarter, type) =>
  client.get(`/reports/submissions?quarter=${quarter}&type=${type}`);

