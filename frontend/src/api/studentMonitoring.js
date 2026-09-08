// API calls for the principal Student Monitoring page + View Student Details modal.
// Everything is under /student-monitoring (studentMonitoring routes/controller/service).
import client from "./client.js";

// whole dataset for the Records / Progress / Recommendations tabs
export const fetchStudentMonitoring = () => client.get("/student-monitoring");

// one student's full PACE grid (the "View Full Plan" modal)
export const fetchStudentProfile = (student_id) =>
  client.get(`/student-monitoring/${student_id}/profile`);

// PACE Analytics & Rankings tab
export const fetchPaceAnalytics = ({ quarter, gradeLevel } = {}) =>
  client.get("/student-monitoring/pace-analytics", {
    params: {
      ...(quarter ? { quarter } : {}),
      ...(gradeLevel ? { grade_level: gradeLevel } : {}),
    },
  });

// compact "View Student Details" summary
export const fetchStudentSummary = (student_id) =>
  client.get(`/student-monitoring/${student_id}/summary`);

// wide-CSV export of every student's records + grades ({ headers, rows })
export const exportStudentRecords = () =>
  client.get("/student-monitoring/export");
