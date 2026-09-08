// Raw Supabase queries for Student Monitoring (called by studentMonitoring.service).
import { supabaseAdmin } from "../config/supabase.js";

// All students + their grade level (the base list for the monitoring table).
export const findStudents = () =>
  supabaseAdmin
    .from("student")
    .select("student_id, user_id, first_name, last_name, date_of_birth, gender, address, contact_number, grade_level(gl_id, level_name)")
    .order("last_name", { ascending: true });

// Every student_pace row (+ its PACE module) - used to count completed/ongoing.
export const findStudentPaces = () =>
  supabaseAdmin
    .from("student_pace")
    .select("*, pace_module(module_name, subject, module_number, grade_level(level_name, level_order))")
    .order("assigned_date", { ascending: false });

// Diagnostic assessment results - feed the placement recommendations.
export const findDiagnosticAssessments = () =>
  supabaseAdmin
    .from("diagnostic_assessment")
    .select("diag_id, student_id, subject, score, start_pace, learning_gaps, test_date")
    .order("diag_id", { ascending: false });

// ── Student Profile queries (one student - used by the two detail modals) ─────

// One student's profile record (identity + grade level).
export const findStudentProfileById = (student_id) =>
  supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, date_of_birth, gender, address, contact_number, enrollment_date, grade_level(gl_id, level_name)")
    .eq("student_id", student_id)
    .maybeSingle();

// That student's PACE rows (status + dates) for the progress summary/grid.
export const findStudentPacesByStudentId = (student_id) =>
  supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, homework, ready_for_next, assigned_date, start_date, end_date, completion_date, pace_module(module_number, subject, module_name)")
    .eq("student_id", student_id)
    .order("assigned_date", { ascending: true });

// Parent / guardian contact(s) shown in the View Student Details modal.
export const findParentContactsByStudentId = (student_id) =>
  supabaseAdmin
    .from("student_parent_contact")
    .select("contact_id, parent_name, contact_number, email, relationship_to_student")
    .eq("student_id", student_id)
    .order("contact_id", { ascending: true });

// PACE-test scores for the given student_pace ids (latest score per PACE).
export const findPaceTestResultsBySpIds = (spIds) =>
  supabaseAdmin
    .from("pace_test_result")
    .select("pacetest_id, sp_id, score, quarter, date_taken")
    .in("sp_id", spIds)
    // Exclude Requested/Scheduled rows that have no score yet - those are pending
    // PACE-test requests, not results, and would otherwise mask real scores.
    .not("score", "is", null)
    .order("date_taken", { ascending: false });

// The student's projected PACE plan for the active school year (grid rows).
export const findPaceProjectionsByStudent = (student_id, sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("subject, quarter, pace_start, pace_count, status_r0, status_r1, status_r2")
    .eq("student_id", student_id)
    .eq("sy_id", sy_id)
    .order("quarter");

// The student's attendance rows within the school-year date range (present/absent/tardy).
export const findAttendanceByStudentAndYear = (student_id, startDate, endDate) =>
  supabaseAdmin
    .from("attendance")
    .select("att_id, status")
    .eq("student_id", student_id)
    .gte("date_recorded", startDate)
    .lte("date_recorded", endDate);

// ── Bulk queries for the principal "Export Records" (wide CSV) ────────────────

// Every student with the full profile columns the export needs (incl. enrollment_date).
export const findAllStudentsForExport = () =>
  supabaseAdmin
    .from("student")
    .select("student_id, user_id, first_name, last_name, date_of_birth, gender, address, contact_number, enrollment_date, grade_level(level_name)")
    .order("last_name", { ascending: true });

// Self-test scores for the given student_pace ids (all scored attempts).
export const findSelfTestResultsBySpIds = (spIds) =>
  supabaseAdmin
    .from("self_test_result")
    .select("sp_id, score")
    .in("sp_id", spIds)
    .not("score", "is", null);

// Every student's quarterly PACE projection for the active school year (quarter → pace_start).
export const findAllPaceProjections = (sy_id) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, subject, quarter, pace_start")
    .eq("sy_id", sy_id);

// Planned PACE ranges for one quarter. Analytics uses these rows as its roster
// and denominator even when a student has not started the planned PACEs yet.
export const findPaceProjectionsForAnalytics = (sy_id, quarter) =>
  supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, subject, quarter, pace_start, pace_end, pace_count")
    .eq("sy_id", sy_id)
    .eq("quarter", quarter);

// All attendance rows in the active school-year date range (present/absent/tardy per student).
export const findAllAttendanceInRange = (startDate, endDate) =>
  supabaseAdmin
    .from("attendance")
    .select("student_id, status")
    .gte("date_recorded", startDate)
    .lte("date_recorded", endDate);
