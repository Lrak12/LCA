import { supabaseAdmin } from "../config/supabase.js";

// ── Overview queries ──────────────────────────────────────────────────────────

export const findStudents = () =>
  supabaseAdmin
    .from("student")
    .select("student_id, enrollment_date");

export const findStudentPaces = () =>
  supabaseAdmin
    .from("student_pace")
    .select("status, pace_module(grade_level(level_name, level_order))");

export const countTeachers = () =>
  supabaseAdmin
    .from("teacher")
    .select("*", { count: "exact", head: true });

// ── Teacher list ──────────────────────────────────────────────────────────────

// Returns all teachers; grade levels are fetched separately via findGradeLevelsByTeacherId
export const findAllTeachers = () =>
  supabaseAdmin
    .from("teacher")
    .select("teacher_id, user_id, first_name, last_name")
    .order("last_name");

// ── Teacher → grade level → students ─────────────────────────────────────────

// Get grade levels assigned to a teacher
export const findGradeLevelsByTeacherId = (teacher_id, sy_id = null) => {
  let query = supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name")
    .eq("teacher_id", teacher_id);
  if (sy_id) query = query.eq("sy_id", Number(sy_id));
  return query;
};

// Get students enrolled in a set of grade levels
export const findStudentsByGradeLevelIds = (glIds) =>
  supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id")
    .in("gl_id", glIds)
    .order("last_name");

// ── Student paces ─────────────────────────────────────────────────────────────

export const findPaceModulesByGradeLevelIds = (glIds) =>
  supabaseAdmin.from("pace_module").select("module_id").in("gl_id", glIds);

export const findPacesForStudents = (studentIds, moduleIds = null) => {
  let query = supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, status, homework, pace_module(module_number, subject)")
    .in("student_id", studentIds);
  if (moduleIds) query = query.in("module_id", moduleIds);
  return query;
};

export const findPaceTestResultsForPaces = (spIds) =>
  supabaseAdmin
    .from("pace_test_result")
    .select("sp_id, score, quarter, date_taken")
    .in("sp_id", spIds)
    .order("date_taken", { ascending: false });

// ── Attendance (linked to teacher via teacher_id on attendance table) ─────────

export const findAttendanceByTeacherAndRange = (teacher_id, startDate, endDate) =>
  supabaseAdmin
    .from("attendance")
    .select("student_id, status, date_recorded, student(first_name, last_name)")
    .eq("teacher_id", teacher_id)
    .gte("date_recorded", startDate)
    .lte("date_recorded", endDate)
    .order("date_recorded");

export const findAttendanceSummaryByTeacher = (teacher_id, monthNumbers, sy_id) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .select("student_id, month, present_count, absent_count, tardy_count, demerit_total, homework_days, student(first_name, last_name)")
    .eq("recorded_by", teacher_id)
    .in("month", monthNumbers)
    .eq("sy_id", sy_id);

export const findAttendanceSummaryForStudents = (studentIds, monthNumbers, sy_id) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .select("student_id, month, homework_days")
    .in("student_id", studentIds)
    .in("month", monthNumbers)
    .eq("sy_id", sy_id);

export const findPaceStatusesByStudents = (studentIds, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, status_r0, status_r1, status_r2")
    .in("student_id", studentIds)
    .eq("sy_id", sy_id);

export const findPaceProjectionsForReport = (studentIds, quarter, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, subject, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2")
    .in("student_id", studentIds)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id);

// ── Active school year ────────────────────────────────────────────────────────

export const findActiveSchoolYear = () =>
  supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date, end_date")
    .eq("is_active", true)
    .maybeSingle();

export const findSchoolYearById = (sy_id) =>
  supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date, end_date, is_active")
    .eq("sy_id", Number(sy_id))
    .maybeSingle();

export const findAcademicSummaryForTeacher = (teacher_id, quarter, sy_id) =>
  supabaseAdmin
    .from("class_academic_summary")
    .select("*, student(first_name, last_name)")
    .eq("recorded_by", teacher_id)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id)
    .order("student_id");

export const findPaceProjectionForTeacher = (teacher_id, quarter, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, subject, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2, student(first_name, last_name)")
    .eq("recorded_by", teacher_id)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id)
    .order("student_id");

// ── Upsert report data into existing tables ───────────────────────────────────

export const upsertClassAcademicSummary = (rows) =>
  supabaseAdmin
    .from("class_academic_summary")
    .upsert(rows, { onConflict: "student_id,sy_id,quarter" })
    .select();

export const upsertAttendanceMonthlySummary = (rows) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .upsert(rows, { onConflict: "student_id,sy_id,month" })
    .select();

export const upsertReportSubmissions = (rows) =>
  supabaseAdmin
    .from("report_submission")
    .upsert(rows, { onConflict: "teacher_id,sy_id,report_type,quarter" })
    .select("submission_id, teacher_id, sy_id, report_type, quarter, submitted_at");

export const findReportSubmissions = (report_type, quarter, sy_id) =>
  supabaseAdmin
    .from("report_submission")
    .select("teacher_id, submitted_at")
    .eq("report_type", report_type)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id);

export const findAllReportSubmissions = (sy_id) =>
  supabaseAdmin
    .from("report_submission")
    .select("teacher_id, report_type, quarter, submitted_at")
    .eq("sy_id", sy_id);

export const findReportSubmissionsForTeacher = (teacher_id, sy_id) =>
  supabaseAdmin
    .from("report_submission")
    .select("report_type, quarter, submitted_at")
    .eq("teacher_id", teacher_id)
    .eq("sy_id", sy_id);

// Submit = stamp the teacher's existing projection rows for the quarter.
// Does NOT touch pace_start/pace_end/pace_count/statuses — the plan stays intact.
export const stampPaceProjectionSubmitted = (studentIds, sy_id, quarter, teacher_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .update({ recorded_by: teacher_id })
    .in("student_id", studentIds)
    .eq("sy_id", sy_id)
    .eq("quarter", quarter)
    .select("pqp_id");

export const upsertPaceQuarterlyProjection = (rows) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .upsert(rows, { onConflict: "student_id,sy_id,quarter,subject" })
    .select();

// ── Status checks: did a teacher submit for a given period? ───────────────────

export const findAcademicByTeacher = (teacher_id, quarter, sy_id) =>
  supabaseAdmin
    .from("class_academic_summary")
    .select("cas_id")
    .eq("recorded_by", teacher_id)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id)
    .limit(1)
    .maybeSingle();

export const findAttendanceByTeacherMonths = (teacher_id, months, sy_id) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .select("ams_id")
    .eq("recorded_by", teacher_id)
    .in("month", months)
    .eq("sy_id", sy_id)
    .limit(1)
    .maybeSingle();

export const findPaceByTeacher = (teacher_id, quarter, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("pqp_id")
    .eq("recorded_by", teacher_id)
    .eq("quarter", quarter)
    .eq("sy_id", sy_id)
    .limit(1)
    .maybeSingle();

// ── Teacher's own history: all submitted quarters across all types ─────────────

export const findAllAcademicByTeacher = (teacher_id, sy_id) =>
  supabaseAdmin
    .from("class_academic_summary")
    .select("quarter")
    .eq("recorded_by", teacher_id)
    .eq("sy_id", sy_id);

export const findAllAttendanceByTeacher = (teacher_id, sy_id) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .select("month")
    .eq("recorded_by", teacher_id)
    .eq("sy_id", sy_id);

export const findAllPaceByTeacher = (teacher_id, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("quarter")
    .eq("recorded_by", teacher_id)
    .eq("sy_id", sy_id);

// ── Principal view: which teachers have submitted for a given quarter + type ───

export const findTeachersByAcademicQuarter = (quarter, sy_id) =>
  supabaseAdmin
    .from("class_academic_summary")
    .select("recorded_by")
    .eq("quarter", quarter)
    .eq("sy_id", sy_id);

export const findTeachersByAttendanceMonths = (months, sy_id) =>
  supabaseAdmin
    .from("attendance_monthly_summary")
    .select("recorded_by")
    .in("month", months)
    .eq("sy_id", sy_id);

export const findTeachersByPaceQuarter = (quarter, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("recorded_by")
    .eq("quarter", quarter)
    .eq("sy_id", sy_id);
