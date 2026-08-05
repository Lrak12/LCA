import client from "./client.js";

export const fetchAllTeachers      = () => client.get("/teachers");
// Dashboard landing data. UI: pages/teacher/TeacherDashboard.jsx.
// Backend: GET /teacher/dashboard > controller.getDashboard > service.getTeacherDashboard.
export const fetchTeacherDashboard = () => client.get("/teacher/dashboard");

// PACE Monitoring data (optional { student_id }). UI: teacher/PaceMonitoring.jsx.
// Backend: GET /teacher/pace-monitoring > controller.getPaceMonitoring > service (~1239).
export const fetchTeacherPaceMonitoring = (params = {}) =>
  client.get("/teacher/pace-monitoring", { params });

export const fetchTeacherAssessments = () => client.get("/teacher/assessments");

// The teacher's student roster (shared by several pages). Backend: GET /teacher/students > controller.getStudents.
export const fetchTeacherStudents = () => client.get("/teacher/students");

export const fetchTeacherStudentMonitoring = (params = {}) =>
  client.get("/teacher/student-monitoring", { params });

// Student Monitoring: Records + Progress tabs (teacher.service.getStudentMonitoringOverview)
export const fetchStudentMonitoringOverview = (params = {}) =>
  client.get("/teacher/student-monitoring-overview", { params });

// Student Monitoring: PACE Analytics tab charts (teacher.service.getPaceAnalyticsOverview)
export const fetchPaceAnalyticsOverview = (params = {}) =>
  client.get("/teacher/pace-analytics-overview", { params });

// Student Monitoring: Ranking tab (teacher.service.getStudentRankings)
export const fetchStudentRankings = (params = {}) =>
  client.get("/teacher/student-rankings", { params });

export const fetchPaceAnalyticsReport = (params = {}) =>
  client.get("/teacher/pace-analytics-report", { params });

// ── Supervisor account settings (own profile + password + contact admin) ──────
export const fetchTeacherAccount         = ()     => client.get("/teacher/account");
export const updateTeacherAccount        = (data) => client.put("/teacher/account", data);
export const changeTeacherPassword       = (data) => client.post("/teacher/account/password", data);
// Email-change verification (code sent to the new address, then confirmed)
export const requestTeacherEmailCode     = (newEmail) => client.post("/teacher/account/email/request-code", { newEmail });
export const verifyTeacherEmailCode      = ({ newEmail, code }) => client.post("/teacher/account/email/verify", { newEmail, code });
export const fetchTeacherSupportRequests = ()     => client.get("/teacher/account/support-requests");
export const submitTeacherSupportRequest = (data) => client.post("/teacher/account/support-requests", data);

// "View Student" academic record modal + its two actions (teacher.service.getStudentAcademicRecord /
// saveSupervisorNote / markReadyForNext)
export const fetchStudentAcademicRecord = (student_id) =>
  client.get("/teacher/student-record", { params: { student_id } });

export const saveSupervisorNote = (student_id, note) =>
  client.post("/teacher/student-record/note", { student_id, note });

export const markReadyForNext = (student_id) =>
  client.post("/teacher/student-record/ready-next", { student_id });

// Supervisor edits a student's profile fields (name, DOB, gender, address, contact).
export const updateStudentProfile = (student_id, body) =>
  client.patch(`/teacher/student-record/${student_id}/profile`, body);

// Supervisor edits one PACE's grade inline ({ student_id, subject, pace_number, score }).
export const setPaceScore = (body) =>
  client.patch("/teacher/student-record/grade", body);

// Load one day's attendance for the class (params { date }). UI: teacher/Attendance.jsx.
// Backend: GET /teacher/attendance > controller.getAttendance > service.getAttendance.
export const fetchTeacherAttendance = (params = {}) =>
  client.get("/teacher/attendance", { params });

// Save the day's attendance (body { date, records:[{student_id,status,notes}] }).
// Backend: POST /teacher/attendance > controller.submitAttendance > service.submitAttendance.
export const submitTeacherAttendance = (body) =>
  client.post("/teacher/attendance", body);

// Initial PACE assignment (the 4-quarter projected plan). Backend: POST /teacher/assign-pace
//   > ReportsController.assignPace > reports.service.generatePaceProjection (~611).
export const assignStudentPace = (student_id, paces) =>
  client.post("/teacher/assign-pace", { student_id, paces });

// A student's saved 4-quarter projection (+ locked quarters). UI: teacher/AssignPace.jsx.
// Backend: GET /teacher/pace-projection > controller.getPaceProjection > service.getStudentPaceProjection (~127).
export const fetchStudentPaceProjection = (student_id) =>
  client.get("/teacher/pace-projection", { params: { student_id } });

// Last completed PACE number per subject (seeds the "basis" on AssignPace / Returning placement).
export const fetchLastCompletedPaces = (student_id) =>
  client.get("/teacher/last-completed-paces", { params: { student_id } });

// Re-base one quarter's PACE numbers. Backend: PATCH /teacher/pace-projection/cell
//   > controller.updatePaceCell > service.updatePaceProjectionCell (~1392).
export const updatePaceCell = (body) =>
  client.patch("/teacher/pace-projection/cell", body);

// Set one grid cell's status. Backend: PATCH /teacher/pace-projection/status
//   > controller.updatePaceCellStatus > service.updatePaceProjectionStatus (~1461).
export const updatePaceCellStatus = (body) =>
  client.patch("/teacher/pace-projection/status", body);

export const fetchReturningStudents = () =>
  client.get("/teacher/returning-students");

// Per-PACE execution data for the Assign/Manage modal. UI: teacher/AssignManagePaceModal.jsx.
// Backend: GET /teacher/student-pace-manage > service.getStudentPaceManage (~2059).
export const fetchStudentPaceManage = (student_id) =>
  client.get("/teacher/student-pace-manage", { params: { student_id } });

// Upsert one student_pace (dates/status/extensions). Backend: POST same path > service.saveStudentPace (~2215).
export const saveStudentPace = (body) =>
  client.post("/teacher/student-pace-manage", body);

// One student's per-PACE assessments. UI: teacher/Assessments.jsx.
// Backend: GET /teacher/record-assessments > controller.getStudentAssessments > service (~2590).
export const fetchStudentAssessments = (student_id) =>
  client.get("/teacher/record-assessments", { params: { student_id } });

// Record a self-test attempt (body { sp_id, score, date_taken }). Backend: service.recordSelfTest (~2686).
export const recordSelfTest = (body) =>
  client.post("/teacher/record-assessments/self-test", body);

// Reset (clear) a student's self-test attempts for a PACE (body { sp_id }). Backend: service.resetSelfTest.
export const resetSelfTest = (body) =>
  client.post("/teacher/record-assessments/self-test/reset", body);

// Record a PACE-test attempt (gated on self-test READY). Backend: service.recordPaceTest (~2716).
export const recordPaceTest = (body) =>
  client.post("/teacher/record-assessments/pace-test", body);

export const fetchPaceTestScheduling = (params = {}) =>
  client.get("/teacher/pace-test-scheduling", { params });

export const fetchScheduledTests = (params = {}) =>
  client.get("/teacher/scheduled-tests", { params });

export const fetchPaceTestSchedule = (student_id) =>
  client.get("/teacher/pace-test-schedule", { params: { student_id } });

export const schedulePaceTest = (body) =>
  client.post("/teacher/pace-test-schedule", body);

export const updatePaceTestSchedule = (pts_id, body) =>
  client.patch(`/teacher/pace-test-schedule/${pts_id}`, body);

export const cancelPaceTest = (pts_id) =>
  client.delete(`/teacher/pace-test-schedule/${pts_id}`);

export const fetchSelfTestPaceNumbers = (params = {}) =>
  client.get("/teacher/assessments/self-test/pace-numbers", { params });

export const fetchSelfTestResults = (params = {}) =>
  client.get("/teacher/assessments/self-test/results", { params });

export const fetchPaceTestResults = (params = {}) =>
  client.get("/teacher/assessments/pace-test/results", { params });

export const bulkSavePaceTests = (body) =>
  client.post("/teacher/assessments/pace-test/bulk", body);

export const fetchMyAttendanceReport = (quarter) =>
  client.get("/teacher/reports/attendance", { params: { quarter } });

export const fetchMyPaceProgressReport = (quarter) =>
  client.get("/teacher/reports/pace-progress", { params: { quarter } });

export const fetchMyAcademicReport = (quarter) =>
  client.get("/teacher/reports/academic", { params: { quarter } });
