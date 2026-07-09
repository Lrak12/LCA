// ============================================================================
// FEATURE MAP - Student Monitoring   (API CLIENT - bridges UI > backend)
// ----------------------------------------------------------------------------
// The UI for this feature (pages/principal/StudentMonitoring.jsx and
// components/StudentSummaryModal.jsx) calls the functions below. Each one sends
// an HTTP request to the backend route in
//   backend/src/routes/studentMonitoring.routes.js
// which then flows: route > controller > service > model (Supabase DB), and the
// JSON result comes back here to the UI.
// ============================================================================
import client from "./client.js";

// GET the whole Student Monitoring dataset (used by the Records/Progress/
// Recommendations tabs). Backend: getOverview > getStudentMonitoring.
export const fetchStudentMonitoring = () => client.get("/student-monitoring");

// GET one student's full PACE profile (the "View Full Plan" modal grid).
// Backend: getStudentProfile > studentMonitoring.service.getStudentProfile.
export const fetchStudentProfile = (student_id) =>
  client.get(`/student-monitoring/${student_id}/profile`);

// GET the PACE Analytics & Rankings tab data. Backend: getPaceAnalytics.
export const fetchPaceAnalytics = () =>
  client.get("/student-monitoring/pace-analytics");

// GET the compact "View Student Details" summary. Backend: getStudentSummary.
export const fetchStudentSummary = (student_id) =>
  client.get(`/student-monitoring/${student_id}/summary`);

