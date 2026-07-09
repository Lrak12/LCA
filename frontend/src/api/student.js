import client from "./client.js";

export const fetchAllStudents          = () => client.get("/students");
export const createStudent             = (payload) => client.post("/students", payload);
export const importStudentsCSV         = (students) => client.post("/students/import", { students });

export const fetchStudentDashboard     = () => client.get("/student/dashboard");
export const fetchStudentPace          = () => client.get("/student/pace");
export const submitPaceTestRequest     = (sp_id) => client.post("/student/pace/test-request", { sp_id });
export const fetchStudentAssessments   = () => client.get("/student/assessments");
export const fetchStudentGrades        = (quarter) => client.get("/student/grades", { params: { quarter } });
export const fetchStudentAttendance    = (month) => client.get("/student/attendance", { params: month ? { month } : {} });
export const fetchStudentAnnouncements = () => client.get("/student/announcements");
export const fetchStudentSettings      = () => client.get("/student/settings");
export const updateStudentProfile      = (data) => client.put("/student/settings/profile", data);
export const updateStudentEmail        = (data) => client.put("/student/settings/email", data);
export const changeStudentPassword     = (data) => client.put("/student/settings/password", data);

// Account Settings (role-agnostic AccountController, mounted under /student)
export const fetchStudentAccount          = () => client.get("/student/account");
export const updateStudentAccount         = (data) => client.put("/student/account", data);
export const changeStudentAccountPassword = (data) => client.post("/student/account/password", data);
export const fetchStudentSupportRequests  = () => client.get("/student/account/support-requests");
export const submitStudentSupportRequest  = (data) => client.post("/student/account/support-requests", data);
