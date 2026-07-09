import client from "./client.js";

export const fetchAllTeachers      = () => client.get("/teachers");
export const fetchTeacherDashboard = () => client.get("/teacher/dashboard");

export const fetchTeacherPaceMonitoring = (params = {}) =>
  client.get("/teacher/pace-monitoring", { params });

export const fetchTeacherAssessments = () => client.get("/teacher/assessments");

export const fetchTeacherStudents = () => client.get("/teacher/students");

export const fetchTeacherStudentMonitoring = (params = {}) =>
  client.get("/teacher/student-monitoring", { params });

export const fetchStudentMonitoringOverview = (params = {}) =>
  client.get("/teacher/student-monitoring-overview", { params });

export const fetchPaceAnalyticsOverview = (params = {}) =>
  client.get("/teacher/pace-analytics-overview", { params });

export const fetchStudentRankings = (params = {}) =>
  client.get("/teacher/student-rankings", { params });

export const fetchPaceAnalyticsReport = (params = {}) =>
  client.get("/teacher/pace-analytics-report", { params });

// ── Supervisor account settings (own profile + password + contact admin) ──────
export const fetchTeacherAccount         = ()     => client.get("/teacher/account");
export const updateTeacherAccount        = (data) => client.put("/teacher/account", data);
export const changeTeacherPassword       = (data) => client.post("/teacher/account/password", data);
export const fetchTeacherSupportRequests = ()     => client.get("/teacher/account/support-requests");
export const submitTeacherSupportRequest = (data) => client.post("/teacher/account/support-requests", data);

export const fetchStudentAcademicRecord = (student_id) =>
  client.get("/teacher/student-record", { params: { student_id } });

export const saveSupervisorNote = (student_id, note) =>
  client.post("/teacher/student-record/note", { student_id, note });

export const markReadyForNext = (student_id) =>
  client.post("/teacher/student-record/ready-next", { student_id });

export const fetchTeacherAttendance = (params = {}) =>
  client.get("/teacher/attendance", { params });

export const submitTeacherAttendance = (body) =>
  client.post("/teacher/attendance", body);

export const assignStudentPace = (student_id, paces) =>
  client.post("/teacher/assign-pace", { student_id, paces });

export const fetchStudentPaceProjection = (student_id) =>
  client.get("/teacher/pace-projection", { params: { student_id } });

export const fetchLastCompletedPaces = (student_id) =>
  client.get("/teacher/last-completed-paces", { params: { student_id } });

export const updatePaceCell = (body) =>
  client.patch("/teacher/pace-projection/cell", body);

export const updatePaceCellStatus = (body) =>
  client.patch("/teacher/pace-projection/status", body);

export const fetchReturningStudents = () =>
  client.get("/teacher/returning-students");

export const fetchStudentPaceManage = (student_id) =>
  client.get("/teacher/student-pace-manage", { params: { student_id } });

export const saveStudentPace = (body) =>
  client.post("/teacher/student-pace-manage", body);

export const fetchStudentAssessments = (student_id) =>
  client.get("/teacher/record-assessments", { params: { student_id } });

export const recordSelfTest = (body) =>
  client.post("/teacher/record-assessments/self-test", body);

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
