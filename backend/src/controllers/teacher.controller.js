import * as TeacherService from "../services/teacher.service.js";
import * as ReportsService  from "../services/reports.service.js";
import { supabaseAdmin }     from "../config/supabase.js";
import { sendSuccess, sendCreated } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await TeacherService.getAllTeachers();
  sendSuccess(res, data);
});

export const getById = asyncHandler(async (req, res) => {
  const data = await TeacherService.getTeacherById(req.params.id);
  sendSuccess(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const { email, password, username, ...profile } = req.body;
  const data = await TeacherService.createTeacher({ email, password, username }, profile);
  sendCreated(res, data, "Teacher created successfully");
});

export const update = asyncHandler(async (req, res) => {
  const data = await TeacherService.updateTeacher(req.params.id, req.body);
  sendSuccess(res, data, "Teacher updated successfully");
});

export const remove = asyncHandler(async (req, res) => {
  await TeacherService.deleteTeacher(req.params.id);
  sendSuccess(res, null, "Teacher deleted successfully");
});

export const getStudents = asyncHandler(async (req, res) => {
  const data = await TeacherService.getStudentsForTeacher(req.user.user_id);
  sendSuccess(res, data);
});

export const getPaceProjection = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getStudentPaceProjection(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data);
});

const VALID_PACE_STATUSES = ["completed", "ongoing", "not-started", "taken-home", "needs-next"];

export const updatePaceStatus = asyncHandler(async (req, res) => {
  const { student_id, subject, quarter, row_index, status } = req.body;
  const ri = parseInt(row_index, 10);
  if (!student_id || !subject || !quarter || ![0,1,2].includes(ri) || !VALID_PACE_STATUSES.includes(status)) {
    return res.status(400).json({ message: "student_id, subject, quarter, row_index (0-2), and a valid status are required" });
  }
  const data = await TeacherService.updatePaceProjectionStatus(req.user.user_id, {
    student_id: parseInt(student_id, 10),
    subject,
    quarter:    parseInt(quarter, 10),
    row_index:  ri,
    status,
  });
  sendSuccess(res, data);
});

export const updatePaceCell = asyncHandler(async (req, res) => {
  const { student_id, subject, quarter, pace_start, pace_count } = req.body;
  if (!student_id || !subject || !quarter || pace_start == null) {
    return res.status(400).json({ message: "student_id, subject, quarter, and pace_start are required" });
  }
  const data = await TeacherService.updatePaceProjectionCell(req.user.user_id, {
    student_id: parseInt(student_id, 10),
    subject,
    quarter:    parseInt(quarter, 10),
    pace_start: parseInt(pace_start, 10),
    pace_count: parseInt(pace_count, 10) || 6,
  });
  sendSuccess(res, data);
});

// getDashboard - handles GET /teacher/dashboard for the supervisor's
// home page. Thin layer: passes the logged-in user's id to the service and returns
// its result as JSON. NEXT > TeacherService.getTeacherDashboard (teacher.service.js).
// UI: pages/teacher/TeacherDashboard.jsx.
export const getDashboard = asyncHandler(async (req, res) => {
  const data = await TeacherService.getTeacherDashboard(req.user.user_id); // user_id from auth middleware
  sendSuccess(res, data);                                                  // { teacher, stats, attendance, recentActivity }
});

// ── Schedule PACE Test ────────────────────────────────────────────────────────
export const getPaceTestSchedule = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getPaceTestSchedule(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data);
});

export const getPaceTestScheduling = asyncHandler(async (req, res) => {
  const { subject, quarter, student_id } = req.query;
  const data = await TeacherService.getPaceTestScheduling(req.user.user_id, {
    subject,
    quarter: quarter ? parseInt(quarter, 10) : null,
    student_id: student_id ? parseInt(student_id, 10) : null,
  });
  sendSuccess(res, data);
});

export const schedulePaceTest = asyncHandler(async (req, res) => {
  const { student_id, subject, pace_number, quarter, scheduled_date, scheduled_time, notes } = req.body;
  if (!student_id || !subject || pace_number == null || !scheduled_date) {
    return res.status(400).json({ message: "student_id, subject, pace_number, and scheduled_date are required" });
  }
  const data = await TeacherService.schedulePaceTest(req.user.user_id, {
    student_id: parseInt(student_id, 10),
    subject,
    pace_number: parseInt(pace_number, 10),
    quarter: quarter != null ? parseInt(quarter, 10) : null,
    scheduled_date,
    scheduled_time,
    notes,
  });
  sendCreated(res, data, "PACE test scheduled");
});

export const cancelPaceTest = asyncHandler(async (req, res) => {
  const data = await TeacherService.cancelPaceTest(req.user.user_id, parseInt(req.params.id, 10));
  sendSuccess(res, data, "PACE test cancelled");
});

export const getScheduledTests = asyncHandler(async (req, res) => {
  const { quarter, subject, status, from, to, student_id } = req.query;
  const data = await TeacherService.getScheduledTests(req.user.user_id, {
    quarter: quarter ? parseInt(quarter, 10) : null,
    subject, status, from, to,
    student_id: student_id ? parseInt(student_id, 10) : null,
  });
  sendSuccess(res, data);
});

export const updatePaceTestSchedule = asyncHandler(async (req, res) => {
  const { scheduled_date, scheduled_time, status } = req.body;
  const data = await TeacherService.updatePaceTestSchedule(req.user.user_id, parseInt(req.params.id, 10), {
    scheduled_date, scheduled_time, status,
  });
  sendSuccess(res, data, "Schedule updated");
});

export const getReturningStudents = asyncHandler(async (req, res) => {
  const data = await TeacherService.getReturningStudents(req.user.user_id);
  sendSuccess(res, data);
});

export const getStudentPaceManage = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getStudentPaceManage(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data);
});

export const saveStudentPace = asyncHandler(async (req, res) => {
  const data = await TeacherService.saveStudentPace(req.user.user_id, req.body);
  sendSuccess(res, data, "PACE assignment saved");
});

export const getPaceAnalyticsOverview = asyncHandler(async (req, res) => {
  const { grade } = req.query;
  const data = await TeacherService.getPaceAnalyticsOverview(req.user.user_id, { grade });
  sendSuccess(res, data);
});

export const getStudentRankings = asyncHandler(async (req, res) => {
  const { grade, rankBy, top, page } = req.query;
  const data = await TeacherService.getStudentRankings(req.user.user_id, {
    grade, rankBy, pageSize: top ? parseInt(top, 10) : 10, page: page ? parseInt(page, 10) : 1,
  });
  sendSuccess(res, data);
});

export const getPaceAnalyticsReport = asyncHandler(async (req, res) => {
  const { grade, quarter } = req.query;
  const data = await TeacherService.getPaceAnalyticsReport(req.user.user_id, { grade, quarter });
  sendSuccess(res, data);
});

export const getStudentAcademicRecord = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getStudentAcademicRecord(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data);
});

export const saveSupervisorNote = asyncHandler(async (req, res) => {
  const { student_id, note } = req.body;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.saveSupervisorNote(req.user.user_id, parseInt(student_id, 10), note ?? "");
  sendSuccess(res, data, "Note saved");
});

// saveAcademicRemarks - POST /teacher/student-record/remarks { student_id, bible_memory_rating, reading_wpm }
export const saveAcademicRemarks = asyncHandler(async (req, res) => {
  const { student_id, bible_memory_rating, reading_wpm } = req.body;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.saveAcademicRemarks(req.user.user_id, parseInt(student_id, 10), { bible_memory_rating, reading_wpm });
  sendSuccess(res, data, "Remarks saved");
});

export const markReadyForNext = asyncHandler(async (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.markReadyForNext(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data, "Marked ready for next PACE");
});

// updateStudentProfile - PATCH /teacher/student/:id/profile { first_name, last_name, date_of_birth, gender, address, contact_number }
export const updateStudentProfile = asyncHandler(async (req, res) => {
  const data = await TeacherService.updateStudentProfile(req.user.user_id, parseInt(req.params.id, 10), req.body ?? {});
  sendSuccess(res, data, "Student information updated");
});

// setPaceScore - PATCH /teacher/student-pace/score { student_id, subject, pace_number, score }
export const setPaceScore = asyncHandler(async (req, res) => {
  const { student_id, subject, pace_number, score } = req.body;
  if (!student_id || !subject || pace_number == null) {
    return res.status(400).json({ message: "student_id, subject and pace_number are required" });
  }
  const data = await TeacherService.setPaceScore(req.user.user_id, { student_id: parseInt(student_id, 10), subject, pace_number, score });
  sendSuccess(res, data, "Grade updated");
});

// getStudentAssessments - GET /teacher/record-assessments?student_id=.
//   Validates the id, then returns that student's per-PACE assessments.
//   NEXT > service.getStudentAssessments. UI: teacher/Assessments.jsx.
export const getStudentAssessments = asyncHandler(async (req, res) => {
  const { student_id, page, page_size } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getStudentAssessments(
    req.user.user_id,
    parseInt(student_id, 10),
    { page: parseInt(page, 10) || 1, pageSize: parseInt(page_size, 10) || 10 },
  );
  sendSuccess(res, data);
});

// recordSelfTest - POST { sp_id, score, date_taken }. NEXT > service.recordSelfTest.
export const recordSelfTest = asyncHandler(async (req, res) => {
  const { sp_id, score, date_taken } = req.body;
  if (!sp_id || score == null) return res.status(400).json({ message: "sp_id and score are required" });
  const data = await TeacherService.recordSelfTest(req.user.user_id, { sp_id, score, date_taken });
  sendCreated(res, data, "Self-test recorded");
});

// resetSelfTest - POST { sp_id }. Clears the student's self-test attempts for this PACE
// so they can be recorded again. NEXT > service.resetSelfTest.
export const resetSelfTest = asyncHandler(async (req, res) => {
  const { sp_id } = req.body;
  if (!sp_id) return res.status(400).json({ message: "sp_id is required" });
  const data = await TeacherService.resetSelfTest(req.user.user_id, { sp_id });
  sendSuccess(res, data, "Self-test attempts reset");
});

// recordPaceTest - POST { sp_id, score, date_taken }. NEXT > service.recordPaceTest
//   (which also completes the PACE + awards points on a passing score).
export const recordPaceTest = asyncHandler(async (req, res) => {
  const { sp_id, score, date_taken } = req.body;
  if (!sp_id || score == null) return res.status(400).json({ message: "sp_id and score are required" });
  const data = await TeacherService.recordPaceTest(req.user.user_id, { sp_id, score, date_taken });
  sendCreated(res, data, "PACE test recorded");
});

export const getAssessments = asyncHandler(async (req, res) => {
  const data = await TeacherService.getAssessments(req.user.user_id);
  sendSuccess(res, data);
});

// getAttendance - GET /teacher/attendance?date=. Defaults to today when
//   no date is passed. NEXT > service.getAttendance. UI: teacher/Attendance.jsx.
export const getAttendance = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const data = await TeacherService.getAttendance(
    req.user.user_id,
    date ?? new Date().toISOString().split("T")[0]        // fallback: today's date
  );
  sendSuccess(res, data);
});

// Full active-school-year attendance used by History Print and Excel export.
export const getAttendanceHistory = asyncHandler(async (req, res) => {
  const data = await TeacherService.getAttendanceHistory(req.user.user_id);
  sendSuccess(res, data);
});

// submitAttendance - POST /teacher/attendance { date, records }. Saves the
//   day's marks. NEXT > service.submitAttendance.
export const submitAttendance = asyncHandler(async (req, res) => {
  const { date, records } = req.body;
  const data = await TeacherService.submitAttendance(req.user.user_id, date, records);
  sendSuccess(res, data, "Attendance submitted successfully");
});

export const getStudentMonitoringOverview = asyncHandler(async (req, res) => {
  const { grade, search, paceStatus, assessStatus, subject, sort, page } = req.query;
  const data = await TeacherService.getStudentMonitoringOverview(req.user.user_id, {
    grade, search, paceStatus, assessStatus, subject, sort, page: page ? parseInt(page, 10) : 1,
  });
  sendSuccess(res, data);
});

export const getStudentMonitoring = asyncHandler(async (req, res) => {
  const { grade, section, status, page, search } = req.query;
  const data = await TeacherService.getStudentMonitoring(req.user.user_id, {
    grade, section, status,
    page:   page ? parseInt(page, 10) : 1,
    search: search ?? "",
  });
  sendSuccess(res, data);
});

export const getExistingSelfTestResults = asyncHandler(async (req, res) => {
  const { subject, quarter } = req.query;
  if (!subject || !quarter) {
    return res.status(400).json({ message: "subject and quarter are required" });
  }
  const data = await TeacherService.getSelfTestResults(req.user.user_id, {
    subject,
    quarter: parseInt(quarter, 10),
  });
  sendSuccess(res, data);
});

export const getSelfTestPaceNumbers = asyncHandler(async (req, res) => {
  const { subject, quarter } = req.query;
  if (!subject || !quarter) {
    return res.status(400).json({ message: "subject and quarter are required" });
  }
  const data = await TeacherService.getSelfTestPaceNumbers(req.user.user_id, {
    subject,
    quarter: parseInt(quarter, 10),
  });
  sendSuccess(res, data);
});

export const bulkSaveSelfTest = asyncHandler(async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: "records[] is required" });
  }
  const data = await TeacherService.bulkSaveSelfTestResults(req.user.user_id, records);
  sendSuccess(res, data, "Self-test results saved");
});

export const getLastCompletedPaces = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ message: "student_id is required" });
  const data = await TeacherService.getLastCompletedPaces(req.user.user_id, parseInt(student_id, 10));
  sendSuccess(res, data);
});

export const getExistingPaceTestResults = asyncHandler(async (req, res) => {
  const { subject, quarter } = req.query;
  if (!subject || !quarter) {
    return res.status(400).json({ message: "subject and quarter are required" });
  }
  const data = await TeacherService.getPaceTestResults(req.user.user_id, {
    subject,
    quarter: parseInt(quarter, 10),
  });
  sendSuccess(res, data);
});

export const bulkSavePaceTest = asyncHandler(async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: "records[] is required" });
  }
  const data = await TeacherService.bulkSavePaceTestResults(req.user.user_id, records);
  sendSuccess(res, data, "PACE test results saved");
});

export const getPaceMonitoring = asyncHandler(async (req, res) => {
  const { student_id } = req.query;
  const data = await TeacherService.getPaceMonitoring(req.user.user_id, {
    student_id: student_id ? parseInt(student_id, 10) : null,
  });
  sendSuccess(res, data);
});

export const saveStudentScriptures = asyncHandler(async (req, res) => {
  const { student_id, scripture_1st, scripture_2nd } = req.body;
  if (!student_id) {
    return res.status(400).json({ message: "student_id is required" });
  }
  if (typeof scripture_1st !== "string" || typeof scripture_2nd !== "string") {
    return res.status(400).json({ message: "Both Scripture entries must be text" });
  }
  const teacher = await resolveTeacherId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.saveStudentScriptures(
    teacher.teacher_id,
    Number(student_id),
    { scripture_1st, scripture_2nd },
  );
  sendSuccess(res, data, "Scripture record saved");
});

const resolveTeacherId = async (user_id) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id, first_name, last_name")
    .eq("user_id", user_id)
    .maybeSingle();
  return teacher;
};

export const getMyAttendanceReport = asyncHandler(async (req, res) => {
  const quarter = parseInt(req.query.quarter, 10) || 4;
  const teacher = await resolveTeacherId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.getTeacherAttendanceReport(teacher.teacher_id, quarter);
  sendSuccess(res, { ...data, teacherName: `${teacher.first_name} ${teacher.last_name}` });
});

export const getMyPaceProgressReport = asyncHandler(async (req, res) => {
  const quarter = parseInt(req.query.quarter, 10) || 1;
  const teacher = await resolveTeacherId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.getTeacherPaceProgressReport(teacher.teacher_id, quarter);
  sendSuccess(res, { ...data, teacherName: `${teacher.first_name} ${teacher.last_name}` });
});

export const getMyAcademicReport = asyncHandler(async (req, res) => {
  const quarter = parseInt(req.query.quarter, 10) || 1;
  const teacher = await resolveTeacherId(req.user.user_id);
  if (!teacher) return res.status(404).json({ message: "Teacher profile not found" });
  const data = await ReportsService.getTeacherAcademicReport(teacher.teacher_id, quarter);
  sendSuccess(res, { ...data, teacherName: `${teacher.first_name} ${teacher.last_name}` });
});
