import * as TeacherModel from "../models/teacher.model.js";
import * as UserModel from "../models/user.model.js";
import * as SelfTestModel from "../models/selfTestResult.model.js";
import * as PaceTestModel from "../models/paceTestResult.model.js";
import * as NotificationService from "./notification.service.js";
import { supabaseAdmin } from "../config/supabase.js";

export const getAllTeachers = async () => {
  const { data, error } = await TeacherModel.findAll();
  if (error) throw new Error(error.message);
  return data;
};

export const getTeacherById = async (teacher_id) => {
  const { data, error } = await TeacherModel.findById(teacher_id);
  if (error) throw new Error("Teacher not found");
  return data;
};

export const getTeacherByUserId = async (user_id) => {
  const { data, error } = await TeacherModel.findByUserId(user_id);
  if (error) throw new Error("Teacher not found");
  return data;
};

export const createTeacher = async (authPayload, profilePayload) => {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: authPayload.email,
    password: authPayload.password,
    email_confirm: true,
    user_metadata: {
      username: authPayload.username,
      role: "teacher",
    },
  });

  if (authError) throw new Error(authError.message);

  const { data: userProfile, error: userError } = await UserModel.findByAuthId(authData.user.id);
  if (userError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new Error("Failed to retrieve user profile after creation.");
  }

  const { data, error } = await TeacherModel.create({
    ...profilePayload,
    user_id: userProfile.user_id,
  });

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new Error(error.message);
  }

  return data;
};

export const updateTeacher = async (teacher_id, payload) => {
  const { data, error } = await TeacherModel.update(teacher_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

// ─── Scope resolver ───────────────────────────────────────────────────────────
// Resolves the students assigned to this teacher via the canonical chain:
// teacher → grade_level (teacher_id FK) → student (gl_id FK).
// Fails closed: a teacher with no assigned grade level gets an empty list.
const resolveTeacherScope = async (user_id) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (!teacher) return { teacher_id: null, studentIds: [] };

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);

  const glIds = (gradeLevels ?? []).map((g) => g.gl_id);
  if (!glIds.length) return { teacher_id: teacher.teacher_id, studentIds: [] };

  const { data: scopedStudents } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .in("gl_id", glIds);

  return { teacher_id: teacher.teacher_id, studentIds: (scopedStudents ?? []).map((s) => s.student_id) };
};

// ── Student resolver (grade_level.teacher_id → student.gl_id) ────────────────
// Fails closed: if no grade_level is assigned to the teacher, return no students.
export const getStudentsForTeacher = async (user_id) => {
  const { data: teacher, error: tErr } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (tErr) throw new Error(tErr.message);
  if (!teacher) return [];

  const { data: gradeLevels, error: glErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name")
    .eq("teacher_id", teacher.teacher_id);

  if (glErr) throw new Error(glErr.message);

  const glIds = (gradeLevels ?? []).map((g) => g.gl_id);
  if (!glIds.length) return [];

  const { data: students, error: sErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id, grade_level(level_name), date_of_birth, gender, address, contact_number")
    .in("gl_id", glIds)
    .order("last_name");

  if (sErr) throw new Error(sErr.message);
  return students ?? [];
};

// ── Load an existing pace_quarterly_projection for one student ────────────────
// Returns { rows, lockedQuarters } — a quarter is locked once any official
// PACE test score has been recorded in it (the plan can no longer be edited).
// getStudentPaceProjection - returns a student's saved pace_quarterly_projection
//   rows for the active school year (+ which quarters are locked because a PACE test
//   was already recorded). Ownership-checked. Called by controller.getPaceProjection
//   (GET /teacher/pace-projection) from teacher/AssignPace.jsx.
export const getStudentPaceProjection = async (user_id, student_id) => {
  const empty = { rows: [], lockedQuarters: [] };

  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return empty;

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();

  const { data } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("quarter, subject, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2")
    .eq("student_id", student_id)
    .eq("sy_id", sy?.sy_id ?? 0)
    .order("quarter")
    .order("subject");

  const { data: spRows } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id")
    .eq("student_id", Number(student_id));
  const spIds = (spRows ?? []).map((r) => r.sp_id);

  let lockedQuarters = [];
  if (spIds.length) {
    const { data: results } = await supabaseAdmin
      .from("pace_test_result")
      .select("quarter")
      .in("sp_id", spIds);
    lockedQuarters = [...new Set((results ?? []).map((r) => r.quarter))].sort();
  }

  return { rows: data ?? [], lockedQuarters };
};

// ── Last completed PACE per subject (basis for Assign Pace) ──────────────────
// For a returning student: the highest PACE number they actually finished —
// a student_pace marked "Completed" or one with a passed official PACE test.
// Returns { subject: maxPaceNumber }. Empty when no history exists.
export const getLastCompletedPaces = async (user_id, student_id) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return {};

  // Ownership: only the teacher's own students
  const { data: owned } = await supabaseAdmin
    .from("student")
    .select("student_id, grade_level!inner(teacher_id)")
    .eq("student_id", student_id)
    .eq("grade_level.teacher_id", teacher.teacher_id)
    .maybeSingle();
  if (!owned) return {};

  const { data: sps } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, pace_module!inner(subject, module_number)")
    .eq("student_id", student_id);
  if (!sps?.length) return {};

  // Which sp_ids have a passing official PACE test
  const spIds = sps.map((s) => s.sp_id);
  const { data: results } = await supabaseAdmin
    .from("pace_test_result")
    .select("sp_id, passed, score")
    .in("sp_id", spIds);
  const passedSp = new Set(
    (results ?? []).filter((r) => r.passed === true || (r.score != null && r.score >= 90)).map((r) => r.sp_id)
  );

  const maxBySubject = {};
  sps.forEach((sp) => {
    const subject = sp.pace_module?.subject;
    const num     = sp.pace_module?.module_number;
    if (!subject || num == null) return;
    const isCompleted = sp.status === "Completed" || passedSp.has(sp.sp_id);
    if (!isCompleted) return;
    if (maxBySubject[subject] == null || num > maxBySubject[subject]) maxBySubject[subject] = num;
  });

  return maxBySubject;
};

// Builds the supervisor dashboard data (4 stat cards, today's attendance tallies,
// recent-completions feed), all scoped to the teacher's students.
export const getTeacherDashboard = async (user_id) => {
  // Look up this supervisor's teacher row (id + name) from their user_id.
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id, first_name, last_name")
    .eq("user_id", user_id)
    .single();
  if (teacherErr) throw new Error(teacherErr.message);   // no teacher profile > surface the error

  // studentIds = only the students in this teacher's grade level(s). Everything
  // below is filtered to these ids so a supervisor only sees their own class.
  const { studentIds } = await resolveTeacherScope(user_id);

  // Total students (scoped) - a COUNT only (head:true = no rows returned).
  const { count: totalStudents } = await supabaseAdmin
    .from("student")
    .select("*", { count: "exact", head: true })
    .in("student_id", studentIds);

  // All PACE rows for those students (status + name + grade level, for grouping).
  const { data: allPaces } = await supabaseAdmin
    .from("student_pace")
    .select("student_id, status, student(first_name, last_name), pace_module(grade_level(level_name))")
    .in("student_id", studentIds);

  // Group the flat PACE rows BY student, so each student holds a list of paces.
  const studentMap = {};
  (allPaces ?? []).forEach((p) => {
    const sid = p.student_id;
    if (!studentMap[sid]) {                              // first time we see this student:
      studentMap[sid] = {
        name:  `${p.student?.first_name ?? ""} ${p.student?.last_name ?? ""}`.trim(), // display name
        level: p.pace_module?.grade_level?.level_name ?? "—",                         // grade level label
        paces: [],
      };
    }
    studentMap[sid].paces.push(p);                       // add this pace to the student's bucket
  });

  // Turn each student's pace bucket into one row: counts + a % + a status label.
  const studentRows = Object.values(studentMap).map((s) => {
    const total     = s.paces.length;                                          // paces assigned
    const completed = s.paces.filter((p) => p.status === "Completed").length;  // finished
    const inProgress = s.paces.filter((p) => p.status === "In Progress").length; // started
    const progress  = total ? Math.round((completed / total) * 100) : 0;       // % complete (guard /0)
    const onTrack   = inProgress > 0 || completed > 0;                         // any activity = on track
    return { name: s.name, level: s.level, progress, status: onTrack ? "On Track" : "Needs Attention" };
  });

  // Roll the rows up into the 3 headline counts for the stat cards.
  const onTrack  = studentRows.filter((s) => s.status === "On Track").length;        // >=1 pace active/done
  const behind   = studentRows.filter((s) => s.status === "Needs Attention").length; // no activity yet
  const ahead    = studentRows.filter((s) => s.progress >= 80).length;               // 80%+ complete

  // Today's attendance (scoped) — local date, not UTC
  const now = new Date();
  // Build today's date as YYYY-MM-DD from LOCAL parts (avoids the UTC off-by-one).
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { data: todayAtt } = await supabaseAdmin        // today's attendance rows for scoped students
    .from("attendance")
    .select("status")
    .eq("date_recorded", today)
    .in("student_id", studentIds);

  // Tally those rows into the 3 numbers the attendance panel shows.
  const attStats = {
    present: (todayAtt ?? []).filter((r) => r.status === "Present").length,
    late:    (todayAtt ?? []).filter((r) => r.status === "Late").length,
    absent:  (todayAtt ?? []).filter((r) => r.status === "Absent").length,
  };

  // The 3 most-recently completed PACEs (newest end_date first) for the feed.
  const { data: recentCompleted } = await supabaseAdmin
    .from("student_pace")
    .select("student_id, student(first_name, last_name), pace_module(module_name, subject), end_date")
    .eq("status", "Completed")
    .in("student_id", studentIds)
    .order("end_date", { ascending: false })
    .limit(3);

  // Shape each completion into a ready-to-render feed item (icon + text + date).
  const recentActivity = (recentCompleted ?? [])
    .filter((r) => r.end_date)                          // skip rows with no completion date
    .map((r) => ({
      icon:      "check_circle",
      iconBg:    "bg-green-100",
      iconColor: "text-green-600",
      text:      `${r.student?.first_name ?? ""} ${r.student?.last_name ?? ""} completed ${r.pace_module?.subject ?? ""} ${r.pace_module?.module_name ?? ""}`.trim(),
      time:      new Date(r.end_date).toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    }));

  // Final payload consumed by TeacherDashboard.jsx (data.stats / data.attendance / ...).
  return {
    teacher,
    stats: {
      totalStudents: totalStudents ?? 0,
      onTrack,
      behind,
      ahead,
      onTrackPct: totalStudents ? Math.round((onTrack / totalStudents) * 100) : 0, // % of class on track
      behindPct:  totalStudents ? Math.round((behind  / totalStudents) * 100) : 0, // % needing attention
      aheadPct:   totalStudents ? Math.round((ahead   / totalStudents) * 100) : 0, // % at 80%+
    },
    attendance: attStats,          // { present, late, absent } for today
    projectedPaces: studentRows,   // per-student rows (name / level / progress / status)
    recentActivity,                // up to 3 recent completions
  };
};

export const getAssessments = async (user_id) => {
  const { studentIds } = await resolveTeacherScope(user_id);

  // Fetch student_paces scoped to teacher's students
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, pace_module(subject), student(first_name, last_name)")
    .in("student_id", studentIds);

  const spIds = (paces ?? []).map((p) => p.sp_id);

  // Counts scoped to these student_paces
  const [{ count: paceTests }, { count: checkUps }, { count: selfTests }] = await Promise.all([
    supabaseAdmin.from("pace_test_result").select("*", { count: "exact", head: true }).in("sp_id", spIds),
    supabaseAdmin.from("check_up_result").select("*",  { count: "exact", head: true }).in("sp_id", spIds),
    supabaseAdmin.from("self_test_result").select("*", { count: "exact", head: true }).in("sp_id", spIds),
  ]);

  const [{ data: checkUpRows }, { data: selfTestRows }] = await Promise.all([
    supabaseAdmin.from("check_up_result").select("sp_id, score").in("sp_id", spIds).order("attempt_number", { ascending: false }),
    supabaseAdmin.from("self_test_result").select("sp_id, score").in("sp_id", spIds),
  ]);

  const latestCheckUp  = {};
  (checkUpRows  ?? []).forEach((r) => { if (!latestCheckUp[r.sp_id])  latestCheckUp[r.sp_id]  = r.score; });
  const latestSelfTest = {};
  (selfTestRows ?? []).forEach((r) => { latestSelfTest[r.sp_id] = r.score; });

  // Average only the scores that exist — a missing test must not count as 0
  const getStatus = (cu, st) => {
    const scores = [cu, st].filter((v) => v !== undefined);
    const avg    = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 85) return "READY";
    if (avg >= 65) return "NEEDS PRACTICE";
    return "NOT READY";
  };

  const students = (paces ?? [])
    .filter((p) => latestCheckUp[p.sp_id] !== undefined || latestSelfTest[p.sp_id] !== undefined)
    .map((p) => {
      const status = getStatus(latestCheckUp[p.sp_id], latestSelfTest[p.sp_id]);
      const cu     = latestCheckUp[p.sp_id]  ?? 0;
      const st     = latestSelfTest[p.sp_id] ?? 0;
      return {
        id:           p.sp_id,
        name:         `${p.student?.first_name ?? ""} ${p.student?.last_name ?? ""}`.trim(),
        subject:      p.pace_module?.subject ?? "—",
        lastCheckUp:  cu,
        lastSelfTest: st,
        status,
      };
    });

  const ready         = students.filter((s) => s.status === "READY").length;
  const needsPractice = students.filter((s) => s.status === "NEEDS PRACTICE").length;
  const notReady      = students.filter((s) => s.status === "NOT READY").length;

  // Recent assessments scoped to teacher's students
  const { data: recentPA } = await supabaseAdmin
    .from("pace_test_result")
    .select("sp_id, score, date_taken, student_pace!inner(pace_module(subject), student(first_name, last_name))")
    .in("sp_id", spIds)
    .order("date_taken", { ascending: false })
    .limit(5);

  const recentAssessments = (recentPA ?? []).map((r) => ({
    id:      r.sp_id,
    student: `${r.student_pace?.student?.first_name ?? ""} ${r.student_pace?.student?.last_name ?? ""}`.trim(),
    subject: r.student_pace?.pace_module?.subject ?? "—",
    type:    "PACE Test",
    score:   r.score,
    date:    r.date_taken ? new Date(r.date_taken).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
  }));

  return {
    summary: { paceTests: paceTests ?? 0, checkUps: checkUps ?? 0, selfTests: selfTests ?? 0, readyToProceed: ready },
    readiness: { ready, needsPractice, notReady, students },
    recentAssessments,
  };
};

// Loads one day's attendance for the teacher's class: one row per student (saved
// status/notes/time, or null if unmarked) plus a summary tally.
export const getAttendance = async (user_id, date) => {
  // Find this supervisor's teacher_id from their login user_id.
  const { data: teacher, error: tErr } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!teacher) return { date, students: [], summary: { total: 0, present: 0, absent: 0, tardy: 0 } }; // no profile > empty day

  // The grade level(s) this teacher owns (their class).
  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name")
    .eq("teacher_id", teacher.teacher_id);

  const glIds = (gradeLevels ?? []).map((g) => g.gl_id);
  const emptySummary = { total: 0, present: 0, absent: 0, tardy: 0, excused: 0 };
  if (!glIds.length) return { date, students: [], summary: emptySummary, gradeLevels: [] }; // no class assigned > empty

  // All students in those grade levels (alphabetical by last name).
  const { data: students, error: sErr } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id, grade_level(level_name)")
    .in("gl_id", glIds)
    .order("last_name", { ascending: true });
  if (sErr) throw new Error(sErr.message);

  // Any attendance already recorded for those students on THIS date.
  const { data: records, error: recErr } = await supabaseAdmin
    .from("attendance")
    .select("student_id, status, notes, time_recorded")
    .eq("date_recorded", date)
    .in("student_id", (students ?? []).map((s) => s.student_id));
  if (recErr) throw new Error(recErr.message);

  // Index records by student_id for O(1) lookup (status lowercased for the UI).
  const recordMap = {};
  (records ?? []).forEach((r) => { recordMap[r.student_id] = { ...r, status: r.status?.toLowerCase() }; });

  // One row per student: their saved status/notes/time, or nulls if not marked yet.
  const rows = (students ?? []).map((s) => {
    const rec = recordMap[s.student_id];
    return {
      student_id:    s.student_id,
      name:          `${s.first_name} ${s.last_name}`.trim(),
      grade:         s.grade_level?.level_name ?? "—",
      status:        rec?.status ?? null,           // null = not marked yet
      notes:         rec?.notes  ?? "",
      time_recorded: rec?.time_recorded ?? null,
    };
  });

  // Tally the recorded statuses for the summary cards.
  const present = rows.filter((r) => r.status === "present").length;
  const absent  = rows.filter((r) => r.status === "absent").length;
  const tardy   = rows.filter((r) => r.status === "late").length;
  const excused = rows.filter((r) => r.status === "excused").length;

  // Payload consumed by teacher/Attendance.jsx (students / summary / gradeLevels).
  return {
    date,
    students: rows,
    summary: { total: rows.length, present, absent, tardy, excused },
    gradeLevels: (gradeLevels ?? []).map((g) => g.level_name),
  };
};

// Saves one day's attendance. Validates input, confirms every submitted student
// belongs to this teacher (security), then upserts one row per student for the date.
export const submitAttendance = async (user_id, date, records) => {
  // Reject empty/malformed payloads up front.
  if (!date || !Array.isArray(records) || records.length === 0) {
    throw new Error("date and records[] are required");
  }

  // Resolve the submitting teacher.
  const { data: teacher, error: tErr } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!teacher) throw new Error("Teacher profile not found");

  // Ownership check: every submitted student must belong to this teacher's grade levels
  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);

  const glIds = (gradeLevels ?? []).map((g) => g.gl_id);
  if (!glIds.length) throw new Error("No grade level assigned to this teacher");

  // The set of student ids this teacher is actually allowed to mark.
  const { data: ownedStudents } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .in("gl_id", glIds);

  const ownedIds = new Set((ownedStudents ?? []).map((s) => s.student_id));
  // Any submitted id NOT in that set = tampering > reject the whole request.
  const foreign  = [...new Set(records.map((r) => r.student_id))].filter((id) => !ownedIds.has(id));
  if (foreign.length) {
    throw new Error(`Students not assigned to this teacher: ${foreign.join(", ")}`);
  }

  // Shape each record into an attendance row (stamped with teacher_id + date).
  const rows = records.map((r) => ({
    student_id:    r.student_id,
    teacher_id:    teacher.teacher_id,
    date_recorded: date,
    status:        r.status,
    notes:         r.notes ?? "",
  }));

  // Upsert: insert new rows or overwrite existing ones for the same student+date
  //   (so re-submitting a day edits it instead of duplicating).
  const { error } = await supabaseAdmin
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,date_recorded" });
  if (error) throw new Error(error.message);
  return { submitted: rows.length };
};

export const getStudentMonitoring = async (user_id, { grade, section, status, page = 1, search = "" } = {}) => {
  const PAGE_SIZE = 5;

  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (!teacher) return { students: [], totalStudents: 0, totalPages: 0 };

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);

  const glIds = (gradeLevels ?? []).map((g) => g.gl_id);
  if (!glIds.length) return { students: [], totalStudents: 0, totalPages: 0 };

  // Fetch ALL of the teacher's students — filters must apply before pagination
  let query = supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, grade_level(level_name)")
    .in("gl_id", glIds);

  if (section) query = query.eq("section", section);

  const { data: students } = await query.order("student_id", { ascending: true });

  const studentIds = (students ?? []).map((s) => s.student_id);

  // Fetch all student_paces for these students
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, status, current_pace, pace_module(subject, module_number, total_paces)")
    .in("student_id", studentIds);

  const spIds = (paces ?? []).map((p) => p.sp_id);

  // Latest check-up and self-test per sp_id for readiness
  const [{ data: checkUps }, { data: selfTests }] = await Promise.all([
    supabaseAdmin.from("check_up_result").select("sp_id, score").in("sp_id", spIds).order("attempt_number", { ascending: false }),
    supabaseAdmin.from("self_test_result").select("sp_id, score").in("sp_id", spIds),
  ]);

  const latestCU = {};
  (checkUps  ?? []).forEach((r) => { if (!latestCU[r.sp_id]) latestCU[r.sp_id] = r.score; });
  const latestST = {};
  (selfTests ?? []).forEach((r) => { latestST[r.sp_id] = r.score; });

  // Group paces by student
  const pacesByStudent = {};
  (paces ?? []).forEach((p) => {
    if (!pacesByStudent[p.student_id]) pacesByStudent[p.student_id] = [];
    pacesByStudent[p.student_id].push(p);
  });

  const subjectAbbr = (subj = "") => {
    const map = { Mathematics: "MATH", Science: "SCI", English: "ENG", History: "HIS", Literature: "LIT", "Word Building": "WORD" };
    return map[subj] ?? subj.slice(0, 4).toUpperCase();
  };

  let rows = (students ?? []).map((s) => {
    const sp = pacesByStudent[s.student_id] ?? [];

    // Completion: average across all assigned paces
    const totalUnits     = sp.reduce((acc, p) => acc + (p.pace_module?.total_paces ?? 20), 0);
    const completedUnits = sp.reduce((acc, p) => acc + (p.current_pace ?? 0), 0);
    const completion = totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0;

    // Progress status
    let progressStatus = "ON TRACK";
    if (completion < 30)      progressStatus = "AT RISK";
    else if (completion < 60) progressStatus = "BEHIND";
    else if (completion >= 90) progressStatus = "AHEAD";

    // Readiness: average of the scores that exist — a missing test is not a 0
    const scores = sp
      .map((p) => {
        const vals = [latestCU[p.sp_id], latestST[p.sp_id]].filter((v) => v !== undefined && v !== null);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      })
      .filter((v) => v !== null);

    let readiness = "DEVELOPING";
    if (scores.length) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg >= 85)      readiness = "READY";
      else if (avg < 65)  readiness = "NEEDS SUPPORT";
    }

    // PACE badge codes
    const paceCodes = sp.map((p) => `${subjectAbbr(p.pace_module?.subject)} ${p.pace_module?.module_number ?? ""}`.trim());

    return {
      id:             s.student_id,
      name:           `${s.first_name} ${s.last_name}`.trim(),
      grade:          s.grade_level?.level_name ?? "—",
      section:        s.section ?? "—",
      paces:          paceCodes,
      progressStatus,
      completion,
      readiness,
    };
  });

  // Filters apply to the full set, THEN paginate — counts stay correct
  if (grade)  rows = rows.filter((r) => r.grade === grade);
  if (status && status !== "all") rows = rows.filter((r) => r.progressStatus === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || String(r.id).includes(q));
  }

  const totalStudents = rows.length;
  const pageRows      = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    students:      pageRows,
    totalStudents,
    totalPages:    Math.ceil(totalStudents / PAGE_SIZE),
  };
};

// ─── Student Monitoring overview (supervisor dashboard) ──────────────────────
// Stat cards + Student Records table, computed from student_pace execution data.
const SM_PAGE_SIZE = 8;
const ON_TRACK_MARK = 50;   // completion % threshold for "On Track"

// Backs the Records + Progress tabs. Returns { stats, students(page), totalStudents,
// totalPages, gradeLevels, subjects }. Filters run before paging so counts are right.
export const getStudentMonitoringOverview = async (user_id, { grade, search, paceStatus, assessStatus, subject, sort = "asc", page = 1 } = {}) => {
  const empty = {
    stats: { totalStudents: 0, assessed: 0, scheduledToTake: 0, notAssessed: 0,
             paceCompletionRate: 0, avgPaceProgress: 0, needingAttention: 0,
             topPerformer: null },
    students: [], totalStudents: 0, totalPages: 1, gradeLevels: [],
  };

  const { data: teacher } = await supabaseAdmin
    .from("teacher").select("teacher_id").eq("user_id", user_id).maybeSingle();
  if (!teacher) return empty;

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level").select("gl_id, level_name").eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  const glIds = gradeLevels.map((g) => g.gl_id);
  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gender, grade_level(level_name)")
    .in("gl_id", glIds)
    .order("student_id");
  if (!students?.length) return empty;

  const studentIds = students.map((s) => s.student_id);

  // All execution records (per student)
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, status, completion_status, assigned_date, points_earned, pace_module(module_number, subject)")
    .in("student_id", studentIds);

  const pacesByStudent = {};
  studentIds.forEach((id) => { pacesByStudent[id] = []; });
  (paces ?? []).forEach((p) => { pacesByStudent[p.student_id]?.push(p); });

  // Assessment activity per student. "Assessed (Tests Taken)" means the student
  // actually SAT a PACE test — i.e. a scored pace_test_result row. A row that only
  // carries a schedule (status scheduled/rescheduled with no score yet) counts as
  // "Scheduled to Take Test", not assessed. Self-tests are eligibility practice
  // (readiness), so they are deliberately NOT counted as an assessment here —
  // otherwise every scheduled student (who must pass a self-test first) would be
  // swallowed by the "assessed" bucket and never show as scheduled.
  const spIds = (paces ?? []).map((p) => p.sp_id);
  const spToStudent = new Map((paces ?? []).map((p) => [p.sp_id, p.student_id]));
  const takenSet     = new Set();          // students with >=1 scored (taken) pace test
  const scheduledSet = new Set();          // students with an upcoming, not-yet-taken schedule
  const lastPaceByStudent = new Map();     // student_id → latest taken pace test date
  if (spIds.length) {
    const lc = (s) => String(s ?? "").toLowerCase();
    const { data: paceRows } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, score, date_taken, assessment_status, assessment_timestamp")
      .in("sp_id", spIds);
    (paceRows ?? []).forEach((r) => {
      const sid = spToStudent.get(r.sp_id);
      if (!sid) return;
      if (r.score != null) {                         // scored → actually taken
        takenSet.add(sid);
        const prev = lastPaceByStudent.get(sid);
        if (!prev || (r.date_taken && r.date_taken > prev)) lastPaceByStudent.set(sid, r.date_taken);
      } else if (["scheduled", "rescheduled"].includes(lc(r.assessment_status)) && r.assessment_timestamp) {
        scheduledSet.add(sid);                        // upcoming schedule, not yet taken
      }
    });
  }

  // Compute a row from a student + a (possibly subject-scoped) set of PACEs
  const computeRow = (s, sp) => {
    const total     = sp.length;
    const completed = sp.filter((p) => p.status === "Completed").length;
    const inProg    = sp.filter((p) => p.status === "In Progress").length;
    const onTime    = sp.filter((p) => p.completion_status === "On Time").length;
    const completion = total ? Math.round((completed / total) * 1000) / 10 : 0;
    const progress   = total ? Math.round(((completed + inProg) / total) * 1000) / 10 : 0;
    const points     = sp.reduce((a, p) => a + (p.points_earned ?? 0), 0);
    const ongoing = sp.filter((p) => p.status === "In Progress")
      .sort((a, b) => (b.assigned_date ?? "").localeCompare(a.assigned_date ?? ""))[0]
      ?? [...sp].sort((a, b) => (b.assigned_date ?? "").localeCompare(a.assigned_date ?? ""))[0];

    return {
      id:               s.student_id,
      name:             `${s.last_name ?? ""}, ${s.first_name ?? ""}`.trim(),
      gradeLevel:       s.grade_level?.level_name ?? "—",
      gender:           s.gender ?? "—",
      ongoingPace:      ongoing?.pace_module?.module_number != null ? `PACE ${ongoing.pace_module.module_number}` : "—",
      performancePoints: points,
      completedPaces:   completed,
      onTimePaces:      onTime,
      paceStatus:       completion >= ON_TRACK_MARK ? "On Track" : "Needs Attention",
      lastPaceTest:     lastPaceByStudent.get(s.student_id) ?? null,
      assessed:         takenSet.has(s.student_id),
      completion,
      progress,
    };
  };

  // Base rows (overall) drive the stat cards; subject scoping only affects the table.
  const baseRows = students.map((s) => computeRow(s, pacesByStudent[s.student_id] ?? []));
  const allSubjects = [...new Set((paces ?? []).map((p) => p.pace_module?.subject).filter(Boolean))].sort();

  let allRows;
  if (subject && subject !== "all") {
    allRows = students
      .map((s) => ({ s, sp: (pacesByStudent[s.student_id] ?? []).filter((p) => p.pace_module?.subject === subject) }))
      .filter(({ sp }) => sp.length > 0)
      .map(({ s, sp }) => computeRow(s, sp));
  } else {
    allRows = baseRows;
  }

  // Stats over the full (unfiltered) overall set
  const totalStudents = baseRows.length;
  const assessed      = takenSet.size;
  // Scheduled-but-not-taken, excluding anyone already counted as assessed, so the
  // three buckets (assessed / scheduled / not assessed) partition the students and
  // their counts sum to the total.
  const scheduledToTake = [...scheduledSet].filter((sid) => !takenSet.has(sid)).length;
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  const top = [...baseRows].sort((a, b) => b.completion - a.completion || b.performancePoints - a.performancePoints)[0] ?? null;

  const stats = {
    totalStudents,
    assessed,
    scheduledToTake,
    notAssessed:        totalStudents - assessed - scheduledToTake,
    paceCompletionRate: avg(baseRows.map((r) => r.completion)),
    avgPaceProgress:    avg(baseRows.map((r) => r.progress)),
    needingAttention:   baseRows.filter((r) => r.completion < ON_TRACK_MARK).length,
    topPerformer:       top ? { name: top.name, completionRate: top.completion } : null,
  };

  // Filters → paginate
  if (grade && grade !== "all") allRows = allRows.filter((r) => r.gradeLevel === grade);
  if (paceStatus && paceStatus !== "all") allRows = allRows.filter((r) => r.paceStatus === paceStatus);
  if (assessStatus && assessStatus !== "all") {
    allRows = allRows.filter((r) => (assessStatus === "assessed" ? r.assessed : !r.assessed));
  }
  if (search) {
    const q = search.toLowerCase();
    allRows = allRows.filter((r) => r.name.toLowerCase().includes(q) || String(r.id).includes(q));
  }

  // Sort by name ("Last, First") ascending/descending across the full filtered list.
  const sortDir = sort === "desc" ? -1 : 1;
  allRows = [...allRows].sort((a, b) => a.name.localeCompare(b.name) * sortDir);

  const filteredTotal = allRows.length;
  const pageRows = allRows.slice((page - 1) * SM_PAGE_SIZE, page * SM_PAGE_SIZE);

  return {
    stats,
    students:     pageRows,
    totalStudents: filteredTotal,
    totalPages:    Math.max(1, Math.ceil(filteredTotal / SM_PAGE_SIZE)),
    gradeLevels:   gradeLevels.map((g) => g.level_name),
    subjects:      allSubjects,
  };
};

// ─── Ranking tab ─────────────────────────────────────────────────────────────
// Ranking tab: ranks all scoped students by rankBy (points/completed/onTime, tiebreak
// points then name), assigns rank over the full list, then paginates by pageSize (=Top).
export const getStudentRankings = async (user_id, { grade, rankBy = "points", pageSize = 10, page = 1 } = {}) => {
  const empty = { rows: [], total: 0, totalPages: 1, pageSize };

  const { data: teacher } = await supabaseAdmin
    .from("teacher").select("teacher_id").eq("user_id", user_id).maybeSingle();
  if (!teacher) return empty;

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level").select("gl_id, level_name").eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  let glIds = gradeLevels.map((g) => g.gl_id);
  if (grade && grade !== "all") glIds = gradeLevels.filter((g) => g.level_name === grade).map((g) => g.gl_id);
  if (!glIds.length) return empty;

  const { data: students } = await supabaseAdmin
    .from("student").select("student_id, first_name, last_name, grade_level(level_name)").in("gl_id", glIds);
  if (!students?.length) return empty;
  const studentIds = students.map((s) => s.student_id);

  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("student_id, status, completion_status, points_earned")
    .in("student_id", studentIds);

  const byStudent = new Map();
  students.forEach((s) => byStudent.set(s.student_id, {
    id: s.student_id, name: `${s.first_name} ${s.last_name}`.trim(), gradeLevel: s.grade_level?.level_name ?? "—",
    points: 0, completed: 0, onTime: 0, late: 0, extended: 0,
  }));
  (paces ?? []).forEach((p) => {
    const a = byStudent.get(p.student_id);
    if (!a) return;
    a.points += p.points_earned ?? 0;
    if (p.status === "Completed") a.completed += 1;
    if (p.completion_status === "On Time") a.onTime += 1;
    else if (p.completion_status === "Late") a.late += 1;
    else if (p.completion_status === "Extended") a.extended += 1;
  });

  const keyOf = { points: "points", completed: "completed", onTime: "onTime" }[rankBy] ?? "points";
  const ranked = [...byStudent.values()]
    .sort((a, b) => b[keyOf] - a[keyOf] || b.points - a.points || a.name.localeCompare(b.name))
    .map((r, i) => ({ rank: i + 1, ...r }));

  const total = ranked.length;
  const size  = Number(pageSize) || 10;
  const pageRows = ranked.slice((page - 1) * size, page * size);

  return { rows: pageRows, total, totalPages: Math.max(1, Math.ceil(total / size)), pageSize: size };
};

// ─── PACE Analytics tab (charts) ─────────────────────────────────────────────
// PACE Analytics tab: aggregates for the charts (completion by quarter, on-time vs
// late donut, completion by subject, points distribution, below-50% list).
export const getPaceAnalyticsOverview = async (user_id, { grade } = {}) => {
  const empty = {
    stats: { avgCompletionRate: 0, avgPerformancePoints: 0, studentsReady: 0, needingIntervention: 0, totalStudents: 0 },
    completionByQuarter: [0, 0, 0, 0],
    onTimeVsLate: { onTime: 0, late: 0, extended: 0, notCompleted: 0, total: 0 },
    completionBySubject: [],
    pointsDistribution: [],
    below50: [],
  };

  const { data: teacher } = await supabaseAdmin
    .from("teacher").select("teacher_id").eq("user_id", user_id).maybeSingle();
  if (!teacher) return empty;

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level").select("gl_id, level_name").eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  let glIds = gradeLevels.map((g) => g.gl_id);
  if (grade && grade !== "all") {
    glIds = gradeLevels.filter((g) => g.level_name === grade).map((g) => g.gl_id);
  }
  if (!glIds.length) return empty;

  const { data: students } = await supabaseAdmin
    .from("student").select("student_id, first_name, last_name").in("gl_id", glIds);
  if (!students?.length) return empty;
  const studentIds = students.map((s) => s.student_id);

  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("student_id, status, completion_status, completion_date, points_earned, ready_for_next, pace_module(subject, module_number)")
    .in("student_id", studentIds);
  const spList = paces ?? [];

  const { data: projections } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, subject, quarter, pace_start, pace_end")
    .in("student_id", studentIds);

  // Quarter of a PACE (via projection range), null if unknown
  const projByStudent = {};
  (projections ?? []).forEach((p) => { (projByStudent[p.student_id] ??= []).push(p); });
  const paceQuarter = (sp) => {
    const subj = sp.pace_module?.subject, num = sp.pace_module?.module_number;
    const rows = projByStudent[sp.student_id] ?? [];
    const hit = rows.find((r) => r.subject === subj && num != null && num >= r.pace_start && num <= (r.pace_end ?? r.pace_start));
    return hit?.quarter ?? null;
  };

  // Per-student aggregates
  const byStudent = new Map();
  students.forEach((s) => byStudent.set(s.student_id, { sp: [], points: 0, ready: false }));
  spList.forEach((p) => {
    const a = byStudent.get(p.student_id);
    if (!a) return;
    a.sp.push(p);
    a.points += p.points_earned ?? 0;
    if (p.ready_for_next === true) a.ready = true;
  });

  const completions = [];   // per-student completion %
  const rowsBelow = [];
  byStudent.forEach((a, sid) => {
    const total = a.sp.length;
    const done  = a.sp.filter((p) => p.status === "Completed").length;
    const c = total ? Math.round((done / total) * 1000) / 10 : 0;
    completions.push(c);
    if (c < 50) {
      const s = students.find((x) => x.student_id === sid);
      rowsBelow.push({ id: sid, name: s ? `${s.first_name} ${s.last_name}`.trim() : `#${sid}`, completion: c });
    }
  });

  const totalStudents = students.length;
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 100) / 100 : 0);
  const avgCompletionRate = avg(completions);
  const avgPerformancePoints = avg([...byStudent.values()].map((a) => a.points));
  const studentsReady = [...byStudent.values()].filter((a) => a.ready).length;
  const needingIntervention = completions.filter((c) => c < 50).length;

  // Completion by quarter (cumulative completed / cumulative assigned, q1..q4)
  const totalByQ = [0, 0, 0, 0], doneByQ = [0, 0, 0, 0];
  spList.forEach((p) => {
    const q = paceQuarter(p);
    if (!q) return;
    totalByQ[q - 1] += 1;
    if (p.status === "Completed") doneByQ[q - 1] += 1;
  });
  const completionByQuarter = [0, 0, 0, 0].map((_, i) => {
    const t = totalByQ.slice(0, i + 1).reduce((a, b) => a + b, 0);
    const d = doneByQ.slice(0, i + 1).reduce((a, b) => a + b, 0);
    return t ? Math.round((d / t) * 1000) / 10 : 0;
  });

  // On-time vs late — per student, by their latest completed PACE's status
  const otl = { onTime: 0, late: 0, extended: 0, notCompleted: 0 };
  byStudent.forEach((a) => {
    const done = a.sp.filter((p) => p.status === "Completed" && p.completion_date)
      .sort((x, y) => (y.completion_date ?? "").localeCompare(x.completion_date ?? ""));
    if (!done.length) { otl.notCompleted += 1; return; }
    const cs = done[0].completion_status;
    if (cs === "On Time") otl.onTime += 1;
    else if (cs === "Extended") otl.extended += 1;
    else if (cs === "Late") otl.late += 1;
    else otl.notCompleted += 1;
  });

  // Completion by subject (pace-weighted)
  const bySubj = new Map();
  spList.forEach((p) => {
    const subj = p.pace_module?.subject;
    if (!subj) return;
    const a = bySubj.get(subj) ?? { total: 0, done: 0 };
    a.total += 1;
    if (p.status === "Completed") a.done += 1;
    bySubj.set(subj, a);
  });
  const completionBySubject = [...bySubj.entries()]
    .map(([subject, a]) => ({ subject, rate: a.total ? Math.round((a.done / a.total) * 100) : 0 }))
    .sort((x, y) => y.rate - x.rate)
    .slice(0, 6);

  // Performance points distribution
  const buckets = [
    { label: "100-120", test: (p) => p >= 100 },
    { label: "80-99",   test: (p) => p >= 80 && p < 100 },
    { label: "60-79",   test: (p) => p >= 60 && p < 80 },
    { label: "Below 60", test: (p) => p < 60 },
  ];
  const pts = [...byStudent.values()].map((a) => a.points);
  const pointsDistribution = buckets.map((b) => ({ label: b.label, count: pts.filter(b.test).length }));

  return {
    stats: {
      avgCompletionRate, avgPerformancePoints, studentsReady, needingIntervention, totalStudents,
    },
    completionByQuarter,
    onTimeVsLate: { ...otl, total: totalStudents },
    completionBySubject,
    pointsDistribution,
    below50: rowsBelow.sort((a, b) => a.completion - b.completion),
  };
};

// ─── PACE Analytics & Rankings Report (formal report modal) ──────────────────
// Aggregated, print-ready report: top rankings, points distribution, completion
// status summary, PACE-test readiness, and an intervention list — scoped to the
// teacher's grade level(s) and (best-effort) the selected quarter.
export const getPaceAnalyticsReport = async (user_id, { grade, quarter } = {}) => {
  const QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
  const q = Math.min(4, Math.max(1, Number(quarter) || 4));

  const base = {
    quarter: q,
    quarterLabel: QUARTER_LABELS[q - 1],
    schoolYear: "—",
    teacherName: "—",
    principalName: "—",
    gradeLevels: [],
    gradeLabel: grade && grade !== "all" ? grade : "All Grades",
    topRankings: [],
    pointsDistribution: [],
    completionStatus: [],
    readiness: { ready: 0, notReady: 0, total: 0 },
    intervention: [],
    totalStudents: 0,
  };

  const { data: teacher } = await supabaseAdmin
    .from("teacher").select("teacher_id, first_name, last_name").eq("user_id", user_id).maybeSingle();
  if (!teacher) return base;
  base.teacherName = `${teacher.first_name ?? ""} ${teacher.last_name ?? ""}`.trim() || "—";

  const [{ data: sy }, { data: principal }] = await Promise.all([
    supabaseAdmin.from("school_year").select("year_label").eq("is_active", true).maybeSingle(),
    supabaseAdmin.from("principal").select("first_name, last_name").order("principal_id").limit(1).maybeSingle(),
  ]);
  base.schoolYear = sy?.year_label ?? "—";
  if (principal) base.principalName = `${principal.first_name ?? ""} ${principal.last_name ?? ""}`.trim() || "—";

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level").select("gl_id, level_name").eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return base;
  base.gradeLevels = gradeLevels.map((g) => g.level_name);

  let glIds = gradeLevels.map((g) => g.gl_id);
  if (grade && grade !== "all") glIds = gradeLevels.filter((g) => g.level_name === grade).map((g) => g.gl_id);
  if (!glIds.length) return base;

  const { data: students } = await supabaseAdmin
    .from("student").select("student_id, first_name, last_name").in("gl_id", glIds);
  if (!students?.length) return base;
  const studentIds = students.map((s) => s.student_id);

  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, status, completion_status, points_earned, ready_for_next")
    .in("student_id", studentIds);
  const spList = paces ?? [];

  // PACE-test pass map (to flag "PACE Test Not Passed") — by sp_id
  const spIds = spList.map((p) => p.sp_id);
  let passBySp = new Map();
  if (spIds.length) {
    const { data: tests } = await supabaseAdmin
      .from("pace_test_result").select("sp_id, score").in("sp_id", spIds);
    (tests ?? []).forEach((t) => {
      const prev = passBySp.get(t.sp_id) ?? { has: false, passed: false };
      prev.has = true;
      if ((t.score ?? 0) >= 90) prev.passed = true;
      passBySp.set(t.sp_id, prev);
    });
  }

  // Per-student aggregates
  const byStudent = new Map();
  students.forEach((s) => byStudent.set(s.student_id, {
    id: s.student_id, name: `${s.first_name} ${s.last_name}`.trim() || `#${s.student_id}`,
    points: 0, total: 0, completed: 0, late: 0, ready: false, notPassed: 0,
  }));
  spList.forEach((p) => {
    const a = byStudent.get(p.student_id);
    if (!a) return;
    a.total += 1;
    a.points += p.points_earned ?? 0;
    if (p.status === "Completed") a.completed += 1;
    if (p.completion_status === "Late") a.late += 1;
    if (p.ready_for_next === true) a.ready = true;
    const t = passBySp.get(p.sp_id);
    if (t?.has && !t.passed) a.notPassed += 1;
  });

  const rows = [...byStudent.values()].map((a) => ({
    ...a,
    completionRate: a.total ? Math.round((a.completed / a.total) * 1000) / 10 : 0,
  }));
  base.totalStudents = rows.length;

  const statusOf = (rate) => (rate >= 70 ? "On Track" : rate >= 50 ? "Ongoing" : "Needs Intervention");

  // 1. Top 10 rankings (by performance points, tiebreak completion)
  base.topRankings = [...rows]
    .sort((a, b) => b.points - a.points || b.completionRate - a.completionRate || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1, name: r.name, points: r.points,
      completionRate: r.completionRate, status: statusOf(r.completionRate),
    }));

  // 2. Performance points distribution
  const total = rows.length || 1;
  const ptsBuckets = [
    { label: "100 — 129", test: (p) => p >= 100 },
    { label: "80 — 99",   test: (p) => p >= 80 && p < 100 },
    { label: "60 — 79",   test: (p) => p >= 60 && p < 80 },
    { label: "Below 60",  test: (p) => p < 60 },
  ];
  base.pointsDistribution = ptsBuckets.map((b) => {
    const count = rows.filter((r) => b.test(r.points)).length;
    return { range: b.label, count, percentage: Math.round((count / total) * 100) };
  });

  // 3. Completion status summary (across all PACEs)
  const completedPaces = spList.filter((p) => p.status === "Completed");
  const csCount = (cs) => completedPaces.filter((p) => p.completion_status === cs).length;
  const notPassedTotal = rows.reduce((sum, r) => sum + r.notPassed, 0);
  const csBase =
    completedPaces.length + notPassedTotal || 1;
  base.completionStatus = [
    { label: "Completed On Time",       dot: "#22c55e", count: csCount("On Time") },
    { label: "Completed Late",          dot: "#f97316", count: csCount("Late") },
    { label: "Completed with Extension", dot: "#3b82f6", count: csCount("Extended") },
    { label: "PACE Test Not Passed",    dot: "#ef4444", count: notPassedTotal },
  ].map((r) => ({ ...r, percentage: Math.round((r.count / csBase) * 100) }));

  // 4. PACE-test readiness summary
  const ready = rows.filter((r) => r.ready).length;
  base.readiness = { ready, notReady: rows.length - ready, total: rows.length };

  // 5. Students requiring intervention (completion < 50%)
  base.intervention = rows
    .filter((r) => r.completionRate < 50)
    .sort((a, b) => a.completionRate - b.completionRate)
    .map((r) => {
      let concern = "Needs monitoring";
      if (r.completionRate < 35) concern = "Low completion rate";
      else if (r.notPassed > 0) concern = "PACE test not passed";
      else if (r.late > 0) concern = "Late PACEs";
      else if (r.completed === 0) concern = "Not keeping up";
      return {
        name: r.name, completionRate: r.completionRate, points: r.points, concern,
      };
    });

  return base;
};

// ─── Pace Monitoring (pace_quarterly_projection) ─────────────────────────────
// Canonical subject order — must match what AssignPace.jsx stores in the DB.
const PACE_SUBJECT_ORDER = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];

const PACE_QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

// Build 3-row PACE grid from subject→projection map for one quarter
function _buildPaceRows(subjectMap) {
  const rows = [[], [], []];
  PACE_SUBJECT_ORDER.forEach((subj) => {
    const proj  = subjectMap[subj];
    const start = proj?.pace_start ?? null;
    const count = proj?.pace_count ?? null;
    const rowStatuses = [
      proj?.status_r0 ?? "not-started",
      proj?.status_r1 ?? "not-started",
      proj?.status_r2 ?? "not-started",
    ];
    for (let i = 0; i < 3; i++) {
      const cell = { num: start !== null ? start + i : "—", status: rowStatuses[i] };
      if (i === 0) cell.count = count;
      rows[i].push(cell);
    }
  });
  return rows;
}

// Derive a subject's overall status from its three per-PACE row statuses.
// (The projection table tracks status_r0/r1/r2 — there is no single status column.)
function _deriveStatus(proj) {
  if (!proj) return "not-started";
  const statuses = [proj.status_r0, proj.status_r1, proj.status_r2];
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.every((s) => !s || s === "not-started")) return "not-started";
  return "in-progress";
}

// Build "Ready for Next PACE" footer row
function _buildReadiness(subjectMap) {
  return PACE_SUBJECT_ORDER.map((subj) => {
    const proj   = subjectMap[subj];
    const status = _deriveStatus(proj);
    if (status === "not-started") return { label: "In Progress", pct: 0 };
    if (status === "completed")   return { label: "Yes",         pct: null };
    const done = [proj.status_r0, proj.status_r1, proj.status_r2].filter((s) => s === "completed").length;
    return { label: "In Progress", pct: Math.round((done / 3) * 100) };
  });
}

// Overall quarter readiness for class view badge
function _quarterReadiness(subjectMap) {
  const projs = Object.values(subjectMap);
  if (!projs.length) return "Not Ready";
  const statuses = projs.map(_deriveStatus);
  if (statuses.every((s) => s === "completed")) return "Ready";
  if (statuses.some((s) => s === "in-progress" || s === "completed")) return "In Progress";
  return "Not Ready";
}

// Builds the PACE Monitoring data from each student's pace_quarterly_projection:
// `students` (selector list), `individual` (one student's 7x4x3 grid + profile
// card), and `classView` (per-student quarter readiness).
export const getPaceMonitoring = async (user_id, { student_id } = {}) => {
  const empty = { students: [], individual: null, classView: [] }; // safe shape when nothing is scoped

  // Resolve teacher
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return empty;

  // Resolve teacher's grade levels → students
  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name")
    .eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  const glIds = gradeLevels.map((g) => g.gl_id);

  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, users(is_active), grade_level(level_name)")
    .in("gl_id", glIds)
    .order("last_name");
  if (!students?.length) return empty;

  const studentIds = students.map((s) => s.student_id);

  // Active school year (for the profile card "School Year" line)
  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("year_label")
    .eq("is_active", true)
    .maybeSingle();
  const schoolYearLabel = sy?.year_label ?? "—";

  // Fetch all pace_quarterly_projection rows for teacher's students
  const { data: projections } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, quarter, subject, pace_start, pace_end, pace_count, status_r0, status_r1, status_r2")
    .in("student_id", studentIds)
    .order("quarter")
    .order("subject");

  // New vs Returning classification. Intended production rule: a student becomes
  // "Returning" once their account has been DISABLED for a set number of months (they
  // left and came back). Enforcing that waiting period needs a "deactivated_at"
  // timestamp on the users table, which we don't track yet — so for TESTING this is
  // INSTANT: any currently-disabled account (is_active = false) counts as returning;
  // active accounts are New. Add the timestamp + a month threshold to enforce the real
  // waiting period later.
  const returningSet = new Set(
    (students ?? []).filter((s) => s.users?.is_active === false).map((s) => s.student_id),
  );

  // Index: projByStudent[student_id][quarter][subject] = row
  const projByStudent = {};
  students.forEach((s) => {
    projByStudent[s.student_id] = { 1: {}, 2: {}, 3: {}, 4: {} };
  });
  (projections ?? []).forEach((p) => {
    if (projByStudent[p.student_id]) {
      projByStudent[p.student_id][p.quarter][p.subject] = p;
    }
  });

  // Student list (dropdown)
  const studentList = students.map((s) => ({
    student_id: s.student_id,
    name:       `${s.first_name} ${s.last_name}`.trim(),
    initials:   `${s.first_name?.[0] ?? ""}${s.last_name?.[0] ?? ""}`.toUpperCase(),
    gradeLevel: s.grade_level?.level_name ?? "—",
    returning:  returningSet.has(s.student_id),
  }));

  // Individual view for selected student (default: first student)
  const targetId      = student_id ?? students[0]?.student_id;
  const targetStudent = students.find((s) => s.student_id === targetId);
  let individual = null;

  if (targetStudent) {
    const qMap    = projByStudent[targetStudent.student_id];
    // Count PACE cells exactly as the grid renders them: the 3 tracked cells
    // (status_r0/r1/r2) per canonical subject × quarter. The old logic summed
    // pace_count over EVERY projection row — including rows whose pace_count ≠ 3
    // and any stray/duplicate subject rows outside PACE_SUBJECT_ORDER — which
    // double-counted completed/remaining versus what the grid actually shows.
    let completedPaces = 0, totalPaces = 0, homeworkTakenHome = 0;
    [1, 2, 3, 4].forEach((q) => {
      PACE_SUBJECT_ORDER.forEach((subj) => {
        const p = qMap[q]?.[subj];
        if (!p) return;
        [p.status_r0, p.status_r1, p.status_r2].forEach((st) => {
          totalPaces += 1;
          if (st === "completed")  completedPaces += 1;
          if (st === "taken-home") homeworkTakenHome += 1;
        });
      });
    });

    // "PACE Test Ready" when any quarter's projected subjects are all completed
    const paceTestReady = [1, 2, 3, 4].some((q) => {
      const subjs = Object.values(qMap[q] ?? {});
      return subjs.length > 0 && subjs.every((p) => _deriveStatus(p) === "completed");
    });

    // Plan generation date — earliest projection row created_at.
    // Guarded: the created_at column may not exist yet (pre-migration) — tolerate failure.
    let planGenerated = null;
    try {
      const { data: createdRows } = await supabaseAdmin
        .from("pace_quarterly_projection")
        .select("created_at")
        .eq("student_id", targetStudent.student_id)
        .order("created_at", { ascending: true })
        .limit(1);
      planGenerated = createdRows?.[0]?.created_at ?? null;
    } catch {
      planGenerated = null;
    }

    individual = {
      student_id:        targetStudent.student_id,
      name:              `${targetStudent.first_name} ${targetStudent.last_name}`.trim(),
      initials:          `${targetStudent.first_name?.[0] ?? ""}${targetStudent.last_name?.[0] ?? ""}`.toUpperCase(),
      gradeLevel:        targetStudent.grade_level?.level_name ?? "—",
      type:              returningSet.has(targetStudent.student_id) ? "Returning Student" : "New Student",
      schoolYear:        schoolYearLabel,
      paceTestStatus:    paceTestReady ? "PACE Test Ready" : "In Progress",
      planGenerated,
      completedPaces,
      remainingPaces:    Math.max(0, totalPaces - completedPaces),
      homeworkTakenHome,
      quarters: [1, 2, 3, 4].map((q, i) => ({
        label:     PACE_QUARTER_LABELS[i],
        num:       q,
        paces:     _buildPaceRows(qMap[q] ?? {}),
        readiness: _buildReadiness(qMap[q] ?? {}),
      })),
    };
  }

  // Class view for all students
  const classView = students.map((s) => {
    const qMap    = projByStudent[s.student_id];
    const quarters = {};
    [1, 2, 3, 4].forEach((q) => {
      quarters[`Q${q}`] = {
        readiness: _quarterReadiness(qMap[q] ?? {}),
        rows:      _buildPaceRows(qMap[q] ?? {}),
      };
    });
    return {
      student_id: s.student_id,
      name:       `${s.first_name} ${s.last_name}`.trim(),
      quarters,
    };
  });

  return { students: studentList, individual, classView };
};

// updatePaceProjectionCell - re-bases ONE quarter of a subject's plan by upserting
//   its pace_quarterly_projection row (student_id, sy_id, quarter, subject) with a
//   new pace_start/pace_count. The grid derives its 3 numbers consecutively from
//   pace_start, and the row's statuses are reset. Ownership-checked; blocked once a
//   PACE test exists for that quarter. Called by controller.updatePaceCell
//   (PATCH /teacher/pace-projection/cell) from teacher/PaceMonitoring.jsx.
export const updatePaceProjectionCell = async (user_id, { student_id, subject, quarter, pace_start, pace_count }) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { data: studentRow } = await supabaseAdmin
    .from("student")
    .select("student_id, gl_id, grade_level!inner(teacher_id)")
    .eq("student_id", student_id)
    .eq("grade_level.teacher_id", teacher.teacher_id)
    .maybeSingle();
  if (!studentRow) throw new Error("Student not found or not assigned to this teacher");

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) throw new Error("No active school year");

  const start  = Number(pace_start);
  const count  = Number(pace_count) || 3;

  // Locked quarter check: no re-planning once an official PACE test is recorded
  const { data: spRows } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id")
    .eq("student_id", Number(student_id));
  const spIds = (spRows ?? []).map((r) => r.sp_id);
  if (spIds.length) {
    const { data: scored } = await supabaseAdmin
      .from("pace_test_result")
      .select("pacetest_id")
      .in("sp_id", spIds)
      .eq("quarter", Number(quarter))
      .limit(1);
    if (scored?.length) {
      throw new Error(`Quarter ${quarter} is locked — official PACE test scores are already recorded`);
    }
  }

  // NOTE: pace_module/student_pace rows are no longer created here — they are
  // created lazily when a score is first recorded for a projected PACE.

  // ── Upsert pace_quarterly_projection (for monitoring grid display) ─────────
  const { error } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .upsert({
      student_id: Number(student_id),
      sy_id:      sy.sy_id,
      quarter:    Number(quarter),
      subject,
      pace_start: start,
      pace_end:   start + count - 1,
      pace_count: count,
      status_r0:  "not-started",
      status_r1:  "not-started",
      status_r2:  "not-started",
      // recorded_by intentionally omitted — it is the "submitted" stamp,
      // set only when the teacher submits the PACE report
    }, { onConflict: "student_id,sy_id,quarter,subject" });

  if (error) throw new Error(error.message);
  return { updated: true };
};

// updatePaceProjectionStatus - sets the status of ONE cell (row_index 0/1/2) in a
//   subject+quarter's projection row (status_r0 / status_r1 / status_r2). Ownership-
//   checked. Called by controller.updatePaceCellStatus (PATCH /teacher/pace-projection/
//   status) from teacher/PaceMonitoring.jsx (the status picker).
export const updatePaceProjectionStatus = async (user_id, { student_id, subject, quarter, row_index, status }) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { data: studentRow } = await supabaseAdmin
    .from("student")
    .select("student_id, grade_level!inner(teacher_id)")
    .eq("student_id", Number(student_id))
    .eq("grade_level.teacher_id", teacher.teacher_id)
    .maybeSingle();
  if (!studentRow) throw new Error("Student not found or not assigned to this teacher");

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) throw new Error("No active school year");

  const col = `status_r${row_index}`;

  // NOTE: homework (taken-home) counts are computed live from the projection
  // statuses wherever they are displayed. We deliberately do NOT write into
  // attendance_monthly_summary here — rows in that table are what mark an
  // attendance report as "submitted" to the principal.
  const { error } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .update({ [col]: status })
    .eq("student_id", Number(student_id))
    .eq("sy_id", sy.sy_id)
    .eq("quarter", Number(quarter))
    .eq("subject", subject);

  if (error) throw new Error(error.message);

  return { updated: true };
};

// _syncProjectionCell - reflect a recorded test / assignment in the PACE Monitoring
//   grid by setting the matching pace_quarterly_projection cell (status_r0/r1/r2).
//   A PACE number lives in exactly one projection row per subject (the row whose
//   window pace_start..pace_start+pace_count-1 contains it); the cell index is the
//   offset from pace_start. Override rules (per product decision):
//     • "completed" always wins.
//     • "ongoing" never downgrades a completed / taken-home / already-ongoing cell.
//   Non-fatal and best-effort — never blocks the score/assignment write.
async function _syncProjectionCell(student_id, subject, pace_number, targetStatus) {
  try {
    if (!subject || pace_number == null) return;
    const { data: sy } = await supabaseAdmin
      .from("school_year").select("sy_id").eq("is_active", true).maybeSingle();
    if (!sy) return;

    const paceNum = Number(pace_number);
    const { data: rows } = await supabaseAdmin
      .from("pace_quarterly_projection")
      .select("quarter, pace_start, pace_count, status_r0, status_r1, status_r2")
      .eq("student_id", Number(student_id))
      .eq("sy_id", sy.sy_id)
      .eq("subject", subject);

    const row = (rows ?? []).find((r) => {
      const start = r.pace_start;
      const span  = r.pace_count ?? 3;
      return start != null && paceNum >= start && paceNum < start + span;
    });
    if (!row) return;                              // PACE isn't in any projected window

    const idx = paceNum - row.pace_start;          // 0 / 1 / 2
    if (idx < 0 || idx > 2) return;
    const col     = `status_r${idx}`;
    const current = row[col] ?? "not-started";

    // Ongoing must not clobber a finished / taken-home / already-ongoing cell.
    if (targetStatus === "ongoing" && ["completed", "taken-home", "ongoing"].includes(current)) return;
    if (current === targetStatus) return;          // already there

    await supabaseAdmin
      .from("pace_quarterly_projection")
      .update({ [col]: targetStatus })
      .eq("student_id", Number(student_id))
      .eq("sy_id", sy.sy_id)
      .eq("quarter", row.quarter)
      .eq("subject", subject);
  } catch (e) {
    console.warn("[syncProjectionCell] failed:", e.message);
  }
}

// ─── Schedule PACE Test (pace_test_schedule) ─────────────────────────────────
// Resolve a teacher row + verify the student belongs to the teacher's grade levels.
async function _resolveTeacherAndStudent(user_id, student_id) {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { data: studentRow } = await supabaseAdmin
    .from("student")
    .select("student_id, grade_level!inner(teacher_id)")
    .eq("student_id", Number(student_id))
    .eq("grade_level.teacher_id", teacher.teacher_id)
    .maybeSingle();
  if (!studentRow) throw new Error("Student not found or not assigned to this teacher");

  return teacher;
}

export const getPaceTestSchedule = async (user_id, student_id) => {
  await _resolveTeacherAndStudent(user_id, student_id);

  const { data, error } = await supabaseAdmin
    .from("pace_test_schedule")
    .select("pts_id, subject, pace_number, quarter, scheduled_at, status, notes, created_at")
    .eq("student_id", Number(student_id))
    .neq("status", "Cancelled")
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
};

// School-local timezone offset (Asia/Manila = UTC+8, no DST). Teachers enter the
// assessment date/time as Philippine wall-clock time, so we tag it with this offset.
const SCHOOL_TZ_OFFSET = "+08:00";

// Grace window after a scheduled test's time before it counts as a no-show. 0 = cancel
// as soon as the scheduled time passes with no attempt. Raise this for a late buffer.
const MISSED_GRACE_MS = 0; //ilisan ranig 60 * 60 * 1000 para mu 1hr siya before ma cancel 0 lang sa for now for demo lang 

// Combine a date (YYYY-MM-DD) + optional time (HH:MM) into an ISO timestamp, tagged
// with the school timezone. Without the offset the naive string lands in the
// timestamptz column as UTC, and every time renders 8h off (6:00 PM shows as 2:00 AM).
function _toScheduledAt(scheduled_date, scheduled_time) {
  if (!scheduled_date) return null;
  const time = scheduled_time && /^\d{2}:\d{2}/.test(scheduled_time) ? scheduled_time : "00:00";
  return `${scheduled_date}T${time}:00${SCHOOL_TZ_OFFSET}`;
}

export const schedulePaceTest = async (user_id, { student_id, subject, pace_number, quarter, scheduled_date, scheduled_time, notes }) => {
  const teacher = await _resolveTeacherAndStudent(user_id, student_id);

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) throw new Error("No active school year");

  const scheduledAt = _toScheduledAt(scheduled_date, scheduled_time);
  if (!scheduledAt) throw new Error("A valid assessment date is required");

  const { data, error } = await supabaseAdmin
    .from("pace_test_schedule")
    .insert({
      student_id:     Number(student_id),
      teacher_id:     teacher.teacher_id,
      sy_id:          sy.sy_id,
      subject,
      pace_number:    Number(pace_number),
      quarter:        quarter != null ? Number(quarter) : null,
      scheduled_at:   scheduledAt,
      notes:          notes ?? null,
      status:         "Scheduled",
    })
    .select("pts_id, subject, pace_number, quarter, scheduled_at, status, notes")
    .single();

  if (error) throw new Error(error.message);
  return data;
};

// Cancel a scheduled test. The schedule lifecycle lives on pace_test_result
// (assessment_status), not the dead pace_test_schedule table.
export const cancelPaceTest = async (user_id, pacetest_id) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { error } = await supabaseAdmin
    .from("pace_test_result")
    .update({ assessment_status: "Cancelled" })
    .eq("pacetest_id", Number(pacetest_id))
    .eq("recorded_by", teacher.teacher_id);

  if (error) throw new Error(error.message);
  return { cancelled: true };
};

// Resolve the student (user_id + subject/pace) behind a pace_test_result row, so we
// can notify them when their test is scheduled. Returns null if anything is missing.
async function _studentNotifyInfoForPacetest(pacetest_id) {
  const { data: pt } = await supabaseAdmin
    .from("pace_test_result")
    .select("sp_id")
    .eq("pacetest_id", pacetest_id)
    .maybeSingle();
  if (!pt) return null;
  const { data: sp } = await supabaseAdmin
    .from("student_pace")
    .select("student(user_id), pace_module(subject, module_number)")
    .eq("sp_id", pt.sp_id)
    .maybeSingle();
  if (!sp?.student?.user_id) return null;
  return {
    user_id:     sp.student.user_id,
    subject:     sp.pace_module?.subject ?? null,
    pace_number: sp.pace_module?.module_number ?? null,
  };
}

// Format a date (YYYY-MM-DD) + optional time (HH:MM) into a human string for the
// notification message — built from the raw strings so it's timezone-safe.
function _fmtScheduleForMsg(scheduled_date, scheduled_time) {
  const d = new Date(`${scheduled_date}T00:00:00`);
  const dateStr = isNaN(d) ? scheduled_date
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  if (scheduled_time && /^\d{2}:\d{2}/.test(scheduled_time)) {
    const [h, m] = scheduled_time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = ((h + 11) % 12) + 1;
    return `${dateStr} at ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  return dateStr;
}

// Resolve the venue (= student's grade level) for a pace_test_result row.
async function _venueForPacetest(pacetest_id) {
  const { data: pt } = await supabaseAdmin
    .from("pace_test_result")
    .select("sp_id")
    .eq("pacetest_id", pacetest_id)
    .maybeSingle();
  if (!pt) return null;
  const { data: sp } = await supabaseAdmin
    .from("student_pace")
    .select("student(grade_level(level_name))")
    .eq("sp_id", pt.sp_id)
    .maybeSingle();
  return sp?.student?.grade_level?.level_name ?? null;
}

// Schedule a pending request (or edit a schedule). Writes the lifecycle onto
// pace_test_result: assessment_status + assessment_timestamp + venue.
export const updatePaceTestSchedule = async (user_id, pacetest_id, { scheduled_date, scheduled_time, status, venue }) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const patch = {};
  if (scheduled_date) {
    const at = _toScheduledAt(scheduled_date, scheduled_time);
    if (!at) throw new Error("A valid assessment date is required");
    patch.assessment_timestamp = at;
  }
  if (status) {
    if (!["Scheduled", "Completed", "Cancelled", "Rescheduled", "Missed"].includes(status)) {
      throw new Error("Invalid status");
    }
    patch.assessment_status = status;
  }
  if (venue) patch.venue = venue;
  // Default the venue to the student's grade level when scheduling
  if (patch.assessment_timestamp && !patch.venue) {
    const v = await _venueForPacetest(Number(pacetest_id));
    if (v) patch.venue = v;
  }
  if (!Object.keys(patch).length) throw new Error("Nothing to update");

  const { data, error } = await supabaseAdmin
    .from("pace_test_result")
    .update(patch)
    .eq("pacetest_id", Number(pacetest_id))
    .eq("recorded_by", teacher.teacher_id)
    .select("pacetest_id, assessment_status, assessment_timestamp, venue")
    .single();

  if (error) throw new Error(error.message);

  // Notify the student that their PACE test was scheduled/rescheduled. Non-fatal:
  // a notification failure must not fail the scheduling itself.
  if (patch.assessment_timestamp && (status === "Scheduled" || status === "Rescheduled")) {
    try {
      const info = await _studentNotifyInfoForPacetest(Number(pacetest_id));
      if (info?.user_id) {
        const paceLabel = [info.subject, info.pace_number != null ? `PACE ${info.pace_number}` : null].filter(Boolean).join(" ");
        const whenStr   = _fmtScheduleForMsg(scheduled_date, scheduled_time);
        const venueStr  = patch.venue ? ` Venue: ${patch.venue}.` : "";
        await NotificationService.createForUsers([info.user_id], {
          title: status === "Rescheduled" ? "PACE Test Rescheduled" : "PACE Test Scheduled",
          message_content: `Your ${paceLabel || "PACE"} test has been ${status === "Rescheduled" ? "rescheduled" : "scheduled"} for ${whenStr}.${venueStr}`,
        });
      }
    } catch (e) {
      console.warn("[pace-test schedule] notification failed:", e.message);
    }
  }

  return data;
};

// ─── Scheduled PACE Tests page (all of a supervisor's scheduled tests) ────────
// Venue = the student's grade level (per product decision — no separate column).
// "Missed" is derived: a still-active test whose scheduled time has passed.
export const getScheduledTests = async (user_id, { quarter, subject, status, from, to } = {}) => {
  const empty = { stats: { scheduledToday: 0, upcoming: 0, completed: 0, missedOrRescheduled: 0 }, tests: [], subjects: [] };

  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id, first_name, last_name")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return empty;
  const scheduledByName = `${teacher.first_name ?? ""} ${teacher.last_name ?? ""}`.trim() || "Supervisor";

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  const glIds = gradeLevels.map((g) => g.gl_id);
  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, user_id, first_name, last_name, grade_level(level_name)")
    .in("gl_id", glIds);
  if (!students?.length) return empty;

  const studentIds  = students.map((s) => s.student_id);
  const studentById = new Map(students.map((s) => [s.student_id, s]));

  // sp_id → { student_id, subject, pace_number } (schedules live on pace_test_result,
  // keyed by sp_id, so resolve subject/pace via student_pace → pace_module).
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, pace_module!inner(subject, module_number)")
    .in("student_id", studentIds);
  const spInfo = new Map((paces ?? []).map((p) => [p.sp_id, {
    student_id: p.student_id, subject: p.pace_module?.subject, pace_number: p.pace_module?.module_number,
  }]));
  const spIds = (paces ?? []).map((p) => p.sp_id);
  if (!spIds.length) return empty;

  // Scheduled tests live on pace_test_result: assessment_status lifecycle +
  // assessment_timestamp (schedule) + venue. Exclude un-scheduled requests and
  // cancellations; only rows that carry a schedule date.
  const lc = (s) => String(s ?? "").toLowerCase();
  const { data: ptRows } = await supabaseAdmin
    .from("pace_test_result")
    .select("pacetest_id, sp_id, quarter, assessment_status, assessment_timestamp, venue, date_taken, recorded_by")
    .in("sp_id", spIds);
  const rows = (ptRows ?? [])
    .filter((r) =>
      ["scheduled", "rescheduled", "completed", "missed"].includes(lc(r.assessment_status)) &&
      r.assessment_timestamp,
    )
    .map((r) => {
      const info = spInfo.get(r.sp_id) ?? {};
      return {
        pts_id:       r.pacetest_id,
        sp_id:        r.sp_id,
        student_id:   info.student_id ?? null,
        subject:      info.subject ?? "—",
        pace_number:  info.pace_number ?? null,
        quarter:      r.quarter,
        scheduled_at: r.assessment_timestamp,
        status:       r.assessment_status,
        venue:        r.venue ?? null,
        created_at:   r.date_taken ?? null,
      };
    })
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  if (!rows.length) return { ...empty, subjects: [] };

  // Readiness (eligibility): a student is READY when ANY self-test attempt >= 90
  // (no longer the average), keyed student|subject|pace.
  const readySet = new Set();
  if (spIds.length) {
    const { data: selfTests } = await supabaseAdmin
      .from("self_test_result")
      .select("sp_id, score")
      .in("sp_id", spIds);
    (selfTests ?? []).forEach((r) => {
      if (r.score == null || r.score < PACE_TEST_READY_MARK) return;
      const info = spInfo.get(r.sp_id);
      if (info) readySet.add(`${info.student_id}|${info.subject}|${info.pace_number}`);
    });
  }

  // Returning students
  const { data: completedSp } = await supabaseAdmin
    .from("student_pace")
    .select("student_id")
    .in("student_id", studentIds)
    .eq("status", "Completed");
  const returningSet = new Set((completedSp ?? []).map((r) => r.student_id));

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // ── No-show sweep (auto-cancel) ─────────────────────────────────────────────
  // A scheduled test whose time has passed (beyond a grace window) with no recorded
  // attempt is a no-show. Auto-cancel it (status → "Cancelled") and notify the student
  // once that they missed it. Flipping the status dedups the notification. Runs lazily
  // on page load since there's no background job.
  const attemptedSpIds = new Set();
  {
    const { data: attemptRows } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id")
      .in("sp_id", spIds)
      .not("score", "is", null);               // a scored row = the test was actually taken
    (attemptRows ?? []).forEach((r) => attemptedSpIds.add(r.sp_id));
  }
  const missedCutoff = new Date(now.getTime() - MISSED_GRACE_MS);
  const newlyMissed = rows.filter((row) =>
    ["scheduled", "rescheduled"].includes(lc(row.status)) &&
    new Date(row.scheduled_at) < missedCutoff &&
    !attemptedSpIds.has(row.sp_id),
  );
  if (newlyMissed.length) {
    const ids = newlyMissed.map((r) => r.pts_id);
    // Auto-cancel the no-show schedules (dedups future notifications) and reflect it locally.
    await supabaseAdmin.from("pace_test_result").update({ assessment_status: "Cancelled" }).in("pacetest_id", ids);
    newlyMissed.forEach((r) => { r.status = "Cancelled"; });
    // Notify each affected student that they missed it (non-fatal).
    for (const r of newlyMissed) {
      try {
        const uid = studentById.get(r.student_id)?.user_id;
        if (!uid) continue;
        const paceLabel = [r.subject, r.pace_number != null ? `PACE ${r.pace_number}` : null].filter(Boolean).join(" ");
        await NotificationService.createForUsers([uid], {
          title: "Missed PACE Test",
          message_content: `You missed your scheduled ${paceLabel || "PACE"} test, so it has been cancelled. Please see your supervisor to reschedule.`,
        });
      } catch (e) {
        console.warn("[pace-test no-show] notification failed:", e.message);
      }
    }
  }

  // Effective status: derive "Missed" for past, still-active tests
  const effectiveStatus = (row) => {
    const past = new Date(row.scheduled_at) < now;
    if ((row.status === "Scheduled" || row.status === "Rescheduled") && past) return "Missed";
    return row.status;
  };

  const subjectSet = new Set();
  const all = rows.map((row) => {
    const stu  = studentById.get(row.student_id);
    const eff  = effectiveStatus(row);
    const dt   = new Date(row.scheduled_at);
    subjectSet.add(row.subject);
    return {
      pts_id:       row.pts_id,
      student_id:   row.student_id,
      studentName:  stu ? `${stu.first_name} ${stu.last_name}`.trim() : "—",
      gradeLevel:   row.venue ?? stu?.grade_level?.level_name ?? "—",  // = Venue (stored, else grade level)
      studentType:  returningSet.has(row.student_id) ? "Returning Student" : "New Student",
      subject:      row.subject,
      paceNumber:   row.pace_number,
      quarter:      row.quarter,
      scheduledAt:  row.scheduled_at,
      scheduledDateStr: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
      status:       eff,
      eligibility:  readySet.has(`${row.student_id}|${row.subject}|${row.pace_number}`) ? "Ready" : "Not Ready",
      scheduledBy:  scheduledByName,
      scheduledOn:  row.created_at,
    };
  });

  // Stats over the full (unfiltered) set
  const stats = {
    scheduledToday:      all.filter((t) => t.scheduledDateStr === todayStr && (t.status === "Scheduled" || t.status === "Rescheduled")).length,
    upcoming:            all.filter((t) => new Date(t.scheduledAt) >= now && (t.status === "Scheduled" || t.status === "Rescheduled")).length,
    completed:           all.filter((t) => t.status === "Completed").length,
    missedOrRescheduled: all.filter((t) => t.status === "Missed" || t.status === "Rescheduled").length,
  };

  // Apply filters
  let tests = all;
  if (quarter)                      tests = tests.filter((t) => String(t.quarter) === String(quarter));
  if (subject && subject !== "all") tests = tests.filter((t) => t.subject === subject);
  if (status && status !== "all")   tests = tests.filter((t) => t.status === status);
  if (from)                         tests = tests.filter((t) => t.scheduledDateStr >= from);
  if (to)                           tests = tests.filter((t) => t.scheduledDateStr <= to);

  return { stats, tests, subjects: [...subjectSet].sort() };
};

// ─── PACE Test Scheduling page (student requests awaiting scheduling) ─────────
// Flow: a student who PASSED the self-test (score >= 90) requests the PACE test,
// creating a pace_test_result row with assessment_status 'Requested'. This page lists
// those pending requests; the supervisor schedules each one (date/time → 'Scheduled').
const PACE_TEST_READY_MARK = 90;

export const getPaceTestScheduling = async (user_id, { subject, quarter } = {}) => {
  const empty = { stats: { ready: 0, scheduledThisWeek: 0, pending: 0 }, students: [], subjects: [] };

  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return empty;

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return empty;

  const glIds = gradeLevels.map((g) => g.gl_id);
  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, grade_level(level_name)")
    .in("gl_id", glIds)
    .order("last_name");
  if (!students?.length) return empty;

  const studentIds  = students.map((s) => s.student_id);
  const studentById = new Map(students.map((s) => [s.student_id, s]));

  // Self-test score per student|subject|pace (for the eligibility count + score column)
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, pace_module!inner(subject, module_number)")
    .in("student_id", studentIds);
  const spInfo = new Map();
  (paces ?? []).forEach((p) => {
    spInfo.set(p.sp_id, {
      student_id:  p.student_id,
      subject:     p.pace_module?.subject ?? "—",
      pace_number: p.pace_module?.module_number ?? null,
    });
  });
  const spIds = (paces ?? []).map((p) => p.sp_id);

  const scoreKey = (sid, subj, pace) => `${sid}|${subj}|${pace}`;
  const scoreByKey = new Map();      // student|subject|pace → best (highest) self-test score
  let eligibleCount = 0;             // PACEs with ANY self-test attempt >= 90
  if (spIds.length) {
    const { data: selfTests } = await supabaseAdmin
      .from("self_test_result")
      .select("sp_id, score")
      .in("sp_id", spIds);
    // Best (highest) self-test score per sp_id — readiness is any attempt >= 90.
    const bestBySp = new Map();
    (selfTests ?? []).forEach((r) => {
      if (r.score == null) return;
      const cur = bestBySp.get(r.sp_id);
      if (cur == null || r.score > cur) bestBySp.set(r.sp_id, r.score);
    });
    bestBySp.forEach((best, spId) => {
      const info = spInfo.get(spId);
      if (!info) return;
      scoreByKey.set(scoreKey(info.student_id, info.subject, info.pace_number), Math.round(best * 100) / 100);
      if (best >= PACE_TEST_READY_MARK) eligibleCount++;
    });
  }

  // Requests + schedules live on pace_test_result (assessment_status lifecycle)
  const { data: ptRows } = spIds.length
    ? await supabaseAdmin
        .from("pace_test_result")
        .select("pacetest_id, sp_id, quarter, assessment_status, assessment_timestamp, date_taken, score")
        .in("sp_id", spIds)
    : { data: [] };

  const lc = (s) => String(s ?? "").toLowerCase();

  // Scheduled this week (Mon 00:00 → next Mon 00:00, local)
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const weekEnd   = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const scheduledThisWeek = (ptRows ?? []).filter((r) => {
    if (!["scheduled", "rescheduled"].includes(lc(r.assessment_status)) || !r.assessment_timestamp) return false;
    const d = new Date(r.assessment_timestamp);
    return d >= weekStart && d < weekEnd;
  }).length;

  // Pending requests = rows this page lists/acts on (requested, not yet scored)
  const requests = (ptRows ?? []).filter((r) => lc(r.assessment_status) === "requested" && r.score == null);

  const subjectSet = new Set();
  const rows = requests.map((req) => {
    const info = spInfo.get(req.sp_id) ?? {};
    const stu  = studentById.get(info.student_id);
    if (info.subject) subjectSet.add(info.subject);
    return {
      pts_id:        req.pacetest_id,   // frontend row key + schedule target
      student_id:    info.student_id ?? null,
      name:          stu ? `${stu.first_name} ${stu.last_name}`.trim() : "—",
      gradeLevel:    stu?.grade_level?.level_name ?? "—",
      subject:       info.subject ?? "—",
      currentPace:   info.pace_number ?? null,
      selfTestScore: scoreByKey.get(scoreKey(info.student_id, info.subject, info.pace_number)) ?? null,
      quarter:       req.quarter,
      readiness:     "Ready",           // a request only exists after passing the self-test
      requestedDate: req.date_taken,    // request date (stamped at request time)
    };
  });

  // Optional filters (page dropdowns). A null-quarter request stays visible
  // under any quarter so requests never silently disappear.
  let filtered = rows;
  if (subject && subject !== "all") filtered = filtered.filter((r) => r.subject === subject);
  if (quarter)                      filtered = filtered.filter((r) => r.quarter == null || String(r.quarter) === String(quarter));

  return {
    stats: {
      ready:             eligibleCount,   // students eligible to request (passed self-test)
      scheduledThisWeek,
      pending:           requests.length, // requests awaiting scheduling
    },
    students: filtered.sort((a, b) => a.name.localeCompare(b.name)),
    subjects: [...subjectSet].sort(),
  };
};

// ─── Returning Student PACE Placement page ───────────────────────────────────
// List the supervisor's returning students (those with prior completed PACE
// history) plus the demographics shown on the placement card.
function _ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export const getReturningStudents = async (user_id) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) return { students: [], schoolYear: "—" };

  const { data: gradeLevels } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
    .eq("teacher_id", teacher.teacher_id);
  if (!gradeLevels?.length) return { students: [], schoolYear: "—" };

  const glIds = gradeLevels.map((g) => g.gl_id);
  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, date_of_birth, gender, grade_level(level_name)")
    .in("gl_id", glIds)
    .order("last_name");
  if (!students?.length) return { students: [], schoolYear: "—" };

  const studentIds = students.map((s) => s.student_id);

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("year_label")
    .eq("is_active", true)
    .maybeSingle();
  const schoolYear = sy?.year_label ?? "—";

  // Returning = has any completed PACE history
  const { data: completedSp } = await supabaseAdmin
    .from("student_pace")
    .select("student_id")
    .in("student_id", studentIds)
    .eq("status", "Completed");
  const returningSet = new Set((completedSp ?? []).map((r) => r.student_id));

  const list = students
    .filter((s) => returningSet.has(s.student_id))
    .map((s) => ({
      student_id:  s.student_id,
      name:        `${s.first_name} ${s.last_name}`.trim(),
      idNumber:    String(s.student_id),
      dateOfBirth: s.date_of_birth ?? null,
      age:         _ageFromDob(s.date_of_birth),
      gender:      s.gender ?? "—",
      gradeLevel:  s.grade_level?.level_name ?? "—",
      schoolYear,
      status:      "Returnee",
    }));

  return { students: list, schoolYear };
};

// ─── Assign / Manage Student PACE (per-PACE execution records) ───────────────
// completion_status + points_earned are computed automatically on completion:
//   On Time = completed on/before end_date with 0 extensions
//   Extended = completed using >= 1 extension
//   Late = completed after end_date
// Points require a PASSED PACE test (else 0): On Time=10, Extended=7, Late=5.
const PACE_POINTS_BY_STATUS = { "On Time": 10, "Extended": 7, "Late": 5 };

function _computePaceCompletion({ end_date, completion_date, extension_count, passed }) {
  let completion_status;
  if ((extension_count ?? 0) >= 1) completion_status = "Extended";
  else if (!end_date) completion_status = "On Time";                                  // no due date → on time
  else if (completion_date && new Date(completion_date) <= new Date(end_date)) completion_status = "On Time";
  else completion_status = "Late";
  const points_earned = passed ? (PACE_POINTS_BY_STATUS[completion_status] ?? 0) : 0;
  return { completion_status, points_earned };
}

// Resolve teacher + owned student (returns { teacher, student }) or throws.
async function _ownedStudent(user_id, student_id) {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { data: student } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id, grade_level!inner(teacher_id, level_name)")
    .eq("student_id", Number(student_id))
    .eq("grade_level.teacher_id", teacher.teacher_id)
    .maybeSingle();
  if (!student) throw new Error("Student not found or not assigned to this teacher");

  return { teacher, student };
}

const _displayStatus = (sp) => {
  if (!sp) return "Not Yet Started";
  if (sp.status === "Completed") return "Completed";
  // Past the expected end date and still unfinished → Overdue (regardless of
  // whether it was started). The completion status/points are computed only on
  // completion, so an incomplete PACE would otherwise sit as "Assigned" forever.
  if (sp.end_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(sp.end_date);
    if (!isNaN(end) && end < today) return "Overdue";
  }
  if (sp.status === "In Progress") return "Ongoing";
  return "Assigned";
};
const _action = (sp) => {
  if (!sp) return "Assign";
  return sp.status === "Completed" ? "View" : "Manage";
};

// getStudentPaceManage - data for the Assign/Manage modal. Returns { student, stats
//   (completed/ongoing/remaining/points), rows (one per subject, each with ALL that
//   subject's student_pace rows + a defaultPaceNumber), moduleOptions }. Ownership-
//   checked. Called by controller.getStudentPaceManage (GET /teacher/student-pace-manage).
export const getStudentPaceManage = async (user_id, student_id) => {
  const { student } = await _ownedStudent(user_id, student_id);

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("year_label")
    .eq("is_active", true)
    .maybeSingle();

  // All execution records for this student
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, assigned_date, start_date, end_date, completion_date, completion_status, extension_count, points_earned, pace_module(subject, module_number, module_name)")
    .eq("student_id", student.student_id)
    .order("assigned_date", { ascending: false });

  // Projection (the plan) — for subjects not yet executed + suggested start PACE
  const { data: projections } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("subject, quarter, pace_start, pace_end")
    .eq("student_id", student.student_id)
    .order("quarter");

  // Available PACE modules for this grade level (for the form's PACE-number picker)
  const { data: modules } = await supabaseAdmin
    .from("pace_module")
    .select("module_number, module_name, subject")
    .eq("gl_id", student.gl_id)
    .order("module_number");

  const moduleOptions = {};
  (modules ?? []).forEach((m) => {
    (moduleOptions[m.subject] ??= []).push({ pace_number: m.module_number, title: m.module_name });
  });

  // Suggested next start PACE per subject (lowest quarter's pace_start)
  const projectedStart = {};
  (projections ?? []).forEach((p) => {
    if (projectedStart[p.subject] == null && p.pace_start != null) projectedStart[p.subject] = p.pace_start;
  });

  // Current execution row per subject — DETERMINISTIC by PACE number so the
  // displayed PACE is stable across saves: prefer In Progress, else the lowest
  // not-yet-started, else the highest completed.
  const bySubjAll = new Map();
  (paces ?? []).forEach((p) => {
    const subj = p.pace_module?.subject;
    if (!subj) return;
    (bySubjAll.get(subj) ?? bySubjAll.set(subj, []).get(subj)).push(p);
  });
  const num = (p) => p.pace_module?.module_number ?? 0;
  const currentBySubject = new Map();
  bySubjAll.forEach((arr, subj) => {
    const inProg    = arr.filter((p) => p.status === "In Progress").sort((a, b) => num(a) - num(b));
    const assigned  = arr.filter((p) => p.status === "Assigned").sort((a, b) => num(a) - num(b));
    const completed = arr.filter((p) => p.status === "Completed").sort((a, b) => num(b) - num(a));
    currentBySubject.set(subj, inProg[0] ?? assigned[0] ?? completed[0] ?? arr[0]);
  });

  // Subject set = executed subjects ∪ projection subjects, ordered canonically
  const subjectSet = new Set([
    ...PACE_SUBJECT_ORDER,
    ...currentBySubject.keys(),
    ...Object.keys(projectedStart),
  ]);
  const orderIndex = (s) => {
    const i = PACE_SUBJECT_ORDER.indexOf(s);
    return i === -1 ? 999 : i;
  };
  const subjects = [...subjectSet]
    .filter((s) => currentBySubject.has(s) || projectedStart[s] != null)
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b));

  // Projected PACE numbers per subject — 3 PACEs per quarter starting at pace_start
  // (matches the PACE Monitoring grid's r0/r1/r2). → Map(paceNumber -> quarter).
  // Populates the dropdown so all of a quarter's PACEs are reachable before assignment.
  const QUARTER_PACES = 3;
  const projectedPaces = {};
  (projections ?? []).forEach((p) => {
    const m = (projectedPaces[p.subject] ??= new Map());
    if (p.pace_start == null) return;
    for (let i = 0; i < QUARTER_PACES; i++) {
      const n = p.pace_start + i;
      if (!m.has(n)) m.set(n, p.quarter);
    }
  });
  const paceQuarter = (subj, n) => projectedPaces[subj]?.get(n) ?? null;

  const mapPace = (subj, sp) => ({
    sp_id:            sp.sp_id,
    paceNumber:       sp.pace_module?.module_number ?? null,
    paceTitle:        sp.pace_module?.module_name ?? null,
    status:           sp.status ?? null,
    displayStatus:    _displayStatus(sp),
    assignedDate:     sp.assigned_date ?? null,
    startDate:        sp.start_date ?? null,
    endDate:          sp.end_date ?? null,
    completionDate:   sp.completion_date ?? null,
    completionStatus: sp.completion_status ?? null,
    extensionCount:   sp.extension_count ?? 0,
    points:           sp.points_earned ?? 0,
    action:           _action(sp),
    quarter:          paceQuarter(subj, sp.pace_module?.module_number),
  });
  const synthPace = (subj, n) => ({
    sp_id: null, paceNumber: n, paceTitle: null, status: null, displayStatus: "Not Yet Started",
    assignedDate: null, startDate: null, endDate: null, completionDate: null,
    completionStatus: null, extensionCount: 0, points: 0, action: "Assign",
    quarter: paceQuarter(subj, n),
  });

  // Each subject row carries ALL its PACEs (projected ∪ assigned) for the dropdown.
  const rows = subjects.map((subj) => {
    const assignedByNum = new Map();
    (bySubjAll.get(subj) ?? []).forEach((sp) => assignedByNum.set(sp.pace_module?.module_number, sp));
    const projMap = projectedPaces[subj] ?? new Map();
    const allNums = [...new Set([...projMap.keys(), ...assignedByNum.keys()])].filter((n) => n != null).sort((a, b) => a - b);

    let paces = allNums.map((n) => {
      const sp = assignedByNum.get(n);
      return sp ? mapPace(subj, sp) : synthPace(subj, n);
    });
    if (!paces.length && projectedStart[subj] != null) paces = [synthPace(subj, projectedStart[subj])];

    const cur = currentBySubject.get(subj);
    const defaultPaceNumber = cur?.pace_module?.module_number ?? projectedStart[subj] ?? paces[0]?.paceNumber ?? null;

    // Dropdown shows ONLY the current quarter's PACEs for this subject.
    const currentQuarter = paces.find((p) => p.paceNumber === defaultPaceNumber)?.quarter ?? null;
    const quarterPaces = currentQuarter != null ? paces.filter((p) => p.quarter === currentQuarter) : paces;

    return { subject: subj, defaultPaceNumber, currentQuarter, paces: quarterPaces };
  });

  const all = paces ?? [];
  const stats = {
    completed:         all.filter((p) => p.status === "Completed").length,
    ongoing:           all.filter((p) => p.status === "In Progress").length,
    remaining:         all.filter((p) => p.status === "Assigned").length,
    performancePoints: all.reduce((sum, p) => sum + (p.points_earned ?? 0), 0),
  };

  return {
    student: {
      student_id: student.student_id,
      name:       `${student.first_name} ${student.last_name}`.trim(),
      idNumber:   String(student.student_id),
      gradeLevel: student.grade_level?.level_name ?? "—",
      schoolYear: sy?.year_label ?? "—",
    },
    stats,
    rows,
    moduleOptions,
  };
};

// saveStudentPace - upserts ONE student_pace (resolving/creating its pace_module).
//   When status becomes "Completed" it AUTO-computes completion_status (On Time /
//   Extended / Late) + points_earned (10/7/5/0, from the latest pace_test pass).
//   Ownership-checked. Called by controller.saveStudentPace (POST /teacher/student-pace-manage).
export const saveStudentPace = async (user_id, payload) => {
  const { student_id, subject, pace_number, status, assigned_date, start_date, end_date, completion_date, extension_count } = payload;
  const { teacher, student } = await _ownedStudent(user_id, student_id);

  if (!subject || !pace_number) throw new Error("Subject and PACE number are required");
  const paceNum = Number(pace_number);
  const newStatus = status || "Assigned";

  // Resolve (or create) the pace_module for this grade level + subject + PACE number
  let { data: module } = await supabaseAdmin
    .from("pace_module")
    .select("module_id, module_name")
    .eq("gl_id", student.gl_id)
    .eq("subject", subject)
    .eq("module_number", paceNum)
    .maybeSingle();

  if (!module) {
    const { data: created, error: mErr } = await supabaseAdmin
      .from("pace_module")
      .insert({ gl_id: student.gl_id, subject, module_number: paceNum, module_name: `${subject} PACE ${paceNum}` })
      .select("module_id, module_name")
      .single();
    if (mErr) throw new Error(mErr.message);
    module = created;
  }

  // Existing execution row for this student + module?
  const { data: existing } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, extension_count")
    .eq("student_id", student.student_id)
    .eq("module_id", module.module_id)
    .maybeSingle();

  const extCount = extension_count != null ? Number(extension_count) : (existing?.extension_count ?? 0);

  const row = {
    student_id:     student.student_id,
    module_id:      module.module_id,
    teacher_id:     teacher.teacher_id,
    status:         newStatus,
    assigned_date:  assigned_date || new Date().toISOString().split("T")[0],
    start_date:     start_date || null,
    end_date:       end_date || null,
    extension_count: extCount,
  };

  // On completion, set completion_date + auto-compute completion_status & points
  if (newStatus === "Completed") {
    const compDate = completion_date || new Date().toISOString().split("T")[0];
    row.completion_date = compDate;

    let passed = false;
    if (existing?.sp_id) {
      const { data: pt } = await supabaseAdmin
        .from("pace_test_result")
        .select("passed")
        .eq("sp_id", existing.sp_id)
        .order("date_taken", { ascending: false })
        .limit(1);
      passed = pt?.[0]?.passed === true;
    }
    const { completion_status, points_earned } = _computePaceCompletion({
      end_date: row.end_date, completion_date: compDate, extension_count: extCount, passed,
    });
    row.completion_status = completion_status;
    row.points_earned     = points_earned;
  }

  let saved;
  if (existing?.sp_id) {
    const { data, error } = await supabaseAdmin
      .from("student_pace")
      .update(row)
      .eq("sp_id", existing.sp_id)
      .select("sp_id")
      .single();
    if (error) throw new Error(error.message);
    saved = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("student_pace")
      .insert(row)
      .select("sp_id")
      .single();
    if (error) throw new Error(error.message);
    saved = data;
  }

  // Assigning a PACE marks its monitoring-grid icon "Ongoing" right away (won't
  // downgrade a completed / taken-home cell). Completing an icon is left to the
  // Record PACE Test flow, so a manual "Completed" save here doesn't touch it.
  if (newStatus === "Assigned" || newStatus === "In Progress") {
    await _syncProjectionCell(student.student_id, subject, paceNum, "ongoing");
  }

  return { sp_id: saved.sp_id };
};

// ─── Student Academic Record (the "View Student" modal) ──────────────────────
function _currentQuarter(startDate) {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.min(4, Math.max(1, Math.floor(months / 3) + 1));
}

// The "View Student" academic record modal: profile, average/points/rank, PACE
// completion + attendance summaries, the per-subject grade grid, remarks, etc.
export const getStudentAcademicRecord = async (user_id, student_id) => {
  const { teacher, student } = await _ownedStudent(user_id, student_id);

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date")
    .eq("is_active", true)
    .maybeSingle();

  // Full student record
  const { data: full } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, date_of_birth, gender, address, contact_number, grade_level(level_name)")
    .eq("student_id", student.student_id)
    .maybeSingle();

  // All execution records
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, completion_status, points_earned, homework, ready_for_next, assigned_date, start_date, end_date, completion_date, pace_module(subject, module_number, module_name)")
    .eq("student_id", student.student_id);
  const spList = paces ?? [];
  const spIds  = spList.map((p) => p.sp_id);

  // PACE test results — only ACTUAL attempts (score not null). Schedule/request rows
  // share this table with a null score; including them makes latestTest return a null
  // score (a Completed PACE shows "Not Started") and inflates the "not passed" count.
  let testsBySp = new Map();
  if (spIds.length) {
    const { data: tr } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, score, date_taken, passed, quarter")
      .in("sp_id", spIds)
      .not("score", "is", null)
      .order("date_taken", { ascending: true });
    (tr ?? []).forEach((r) => { (testsBySp.get(r.sp_id) ?? testsBySp.set(r.sp_id, []).get(r.sp_id)).push(r); });
  }
  const latestTest = (sp_id) => { const a = testsBySp.get(sp_id) ?? []; return a.length ? a[a.length - 1] : null; };

  // ── Top cards ──────────────────────────────────────────────────────────────
  const allScores = [];
  testsBySp.forEach((arr) => arr.forEach((r) => { if (r.score != null) allScores.push(r.score); }));
  const averageScore = allScores.length ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100 : null;
  const performancePoints = spList.reduce((a, p) => a + (p.points_earned ?? 0), 0);

  // Rank within the same grade level (by performance points)
  let rank = null;
  const gradeName = full?.grade_level?.level_name ?? student.grade_level?.level_name;
  {
    const { data: gl } = await supabaseAdmin.from("grade_level").select("gl_id").eq("teacher_id", teacher.teacher_id);
    const glIds = (gl ?? []).map((g) => g.gl_id);
    const { data: peers } = await supabaseAdmin
      .from("student").select("student_id, grade_level(level_name)").in("gl_id", glIds);
    const sameGrade = (peers ?? []).filter((s) => (s.grade_level?.level_name ?? null) === gradeName);
    const peerIds = sameGrade.map((s) => s.student_id);
    if (peerIds.length) {
      const { data: peerPaces } = await supabaseAdmin
        .from("student_pace").select("student_id, points_earned").in("student_id", peerIds);
      const ptsBy = new Map();
      (peerPaces ?? []).forEach((p) => ptsBy.set(p.student_id, (ptsBy.get(p.student_id) ?? 0) + (p.points_earned ?? 0)));
      const ordered = peerIds
        .map((id) => ({ id, pts: ptsBy.get(id) ?? 0 }))
        .sort((a, b) => b.pts - a.pts);
      rank = ordered.findIndex((r) => r.id === student.student_id) + 1 || null;
    }
  }

  // ── PACE completion summary ──────────────────────────────────────────────────
  const completionSummary = {
    onTime:    spList.filter((p) => p.completion_status === "On Time").length,
    late:      spList.filter((p) => p.completion_status === "Late").length,
    extended:  spList.filter((p) => p.completion_status === "Extended").length,
    notPassed: spList.filter((p) => {
      const arr = testsBySp.get(p.sp_id) ?? [];
      return arr.length > 0 && !arr.some((r) => r.passed === true || (r.score != null && r.score >= 90));
    }).length,
  };

  // ── Attendance summary ────────────────────────────────────────────────────────
  const { data: att } = await supabaseAdmin
    .from("attendance").select("status").eq("student_id", student.student_id);
  const aRows = att ?? [];
  const aTotal = aRows.length || 1;
  const attendanceSummary = {
    present: aRows.filter((r) => r.status === "Present").length,
    absent:  aRows.filter((r) => r.status === "Absent").length,
    tardy:   aRows.filter((r) => r.status === "Late" || r.status === "Tardy").length,
    total:   aRows.length,
    presentPct: Math.round((aRows.filter((r) => r.status === "Present").length / aTotal) * 10000) / 100,
    absentPct:  Math.round((aRows.filter((r) => r.status === "Absent").length / aTotal) * 10000) / 100,
    tardyPct:   Math.round((aRows.filter((r) => r.status === "Late" || r.status === "Tardy").length / aTotal) * 10000) / 100,
  };

  // ── Subject grade tables ──────────────────────────────────────────────────────
  // Per subject: rows = quarters, columns = that quarter's projected PACEs (start..+2).
  const { data: projections } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("subject, quarter, pace_start, status_r0, status_r1, status_r2")
    .eq("student_id", student.student_id);

  // student_pace lookup by subject|module_number
  const spBySubjModule = new Map();
  spList.forEach((p) => {
    const subj = p.pace_module?.subject, num = p.pace_module?.module_number;
    if (subj && num != null) spBySubjModule.set(`${subj}|${num}`, p);
  });

  const subjects = [...new Set(spList.map((p) => p.pace_module?.subject).filter(Boolean))].sort();
  const projByKey = new Map();
  (projections ?? []).forEach((r) => projByKey.set(`${r.subject}|${r.quarter}`, r.pace_start));

  const grades = {};
  subjects.forEach((subj) => {
    const quarters = [1, 2, 3, 4].map((q) => {
      const start = projByKey.get(`${subj}|${q}`);
      const cells = [0, 1, 2].map((i) => {
        if (start == null) return { pace: null, score: null, status: "Not Started" };
        const num = start + i;
        const sp  = spBySubjModule.get(`${subj}|${num}`);
        const t   = sp ? latestTest(sp.sp_id) : null;
        const status = !sp ? "Not Started"
          : sp.status === "Completed" ? "Completed"
          : sp.status === "In Progress" ? "Ongoing" : "Not Started";
        return { pace: num, score: t?.score ?? null, status };
      });
      const scores = cells.map((c) => c.score).filter((v) => v != null);
      const total  = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
      return { quarter: q, cells, total };
    });
    const allQ = quarters.flatMap((q) => q.cells.map((c) => c.score)).filter((v) => v != null);
    const average = allQ.length ? Math.round((allQ.reduce((a, b) => a + b, 0) / allQ.length) * 100) / 100 : null;
    grades[subj] = { quarters, average };
  });

  // ── Academic remarks (Bible memory, Reading WPM, supervisor note) ─────────────
  const curQuarter = _currentQuarter(sy?.start_date);
  const { data: remarks } = await supabaseAdmin
    .from("student_academic_remarks")
    .select("quarter, bible_memory_rating, reading_wpm, supervisor_comments")
    .eq("student_id", student.student_id)
    .order("quarter", { ascending: false });
  const curRemark = (remarks ?? []).find((r) => r.quarter === curQuarter) ?? (remarks ?? [])[0] ?? null;

  // ── Recommendations ──────────────────────────────────────────────────────────
  const { data: diag } = await supabaseAdmin
    .from("diagnostic_assessment")
    .select("start_pace, learning_gaps, subject, test_date")
    .eq("student_id", student.student_id)
    .order("test_date", { ascending: false });
  const diagRow = (diag ?? [])[0] ?? null;
  const diagnostic = diagRow
    ? { level: diagRow.start_pace != null ? `${diagRow.start_pace} – ${diagRow.start_pace + 2}` : (diagRow.learning_gaps ?? "—"), basis: "Diagnostic Assessment" }
    : null;

  // Projected next PACE = highest completed module + 1 (primary subject by most PACEs)
  let projected = null;
  if (subjects.length) {
    const bySubjCount = subjects.map((s) => ({ s, n: spList.filter((p) => p.pace_module?.subject === s).length }))
      .sort((a, b) => b.n - a.n);
    const primary = bySubjCount[0].s;
    const maxDone = Math.max(0, ...spList
      .filter((p) => p.pace_module?.subject === primary && p.status === "Completed")
      .map((p) => p.pace_module?.module_number ?? 0));
    const next = maxDone ? maxDone + 1 : null;
    const nextSp = next ? spBySubjModule.get(`${primary}|${next}`) : null;
    projected = {
      pace:  next,
      title: nextSp?.pace_module?.module_name ?? null,
      basis: "Historical PACE Performance and Completion Trend",
      suggestedStart: new Date().toISOString().split("T")[0],
      subject: primary,
    };
  }

  // Academic monitoring: overdue (In Progress past end_date) + tests not passed
  const today = new Date().toISOString().split("T")[0];
  const overdue = spList.filter((p) => p.status === "In Progress" && p.end_date && p.end_date < today).length;
  const monitoring = {
    overdue,
    notPassed: completionSummary.notPassed,
    generated: today,
    needsAttention: overdue > 0 || completionSummary.notPassed > 0,
  };

  // ── Paces brought home + 100s achieved ────────────────────────────────────────
  // Brought-home = cells marked "taken-home" in the quarterly projection — the same
  // source the reports use. The status picker writes only to pace_quarterly_projection,
  // never to student_pace.homework, so that column can't drive this list.
  const broughtHomeList = [];
  (projections ?? []).forEach((r) => {
    [r.status_r0, r.status_r1, r.status_r2].forEach((st, i) => {
      if (st !== "taken-home" || r.pace_start == null) return;
      const num = r.pace_start + i;
      const sp  = spBySubjModule.get(`${r.subject}|${num}`);
      broughtHomeList.push({
        pace: `${_subjAbbr(r.subject)} ${num}`.trim(),
        date: sp?.assigned_date ?? null,
      });
    });
  });
  const hundredsList = [];
  testsBySp.forEach((arr, sp_id) => {
    arr.forEach((r) => {
      if (r.score === 100) {
        const sp = spList.find((p) => p.sp_id === sp_id);
        hundredsList.push({ pace: `${_subjAbbr(sp?.pace_module?.subject)} ${sp?.pace_module?.module_number ?? ""}`.trim(), date: r.date_taken });
      }
    });
  });

  return {
    profile: {
      student_id: student.student_id,
      first_name: full?.first_name ?? student.first_name ?? "",
      last_name:  full?.last_name ?? student.last_name ?? "",
      name:       `${full?.first_name ?? student.first_name} ${full?.last_name ?? student.last_name}`.trim(),
      dateOfBirth: full?.date_of_birth ?? null,
      gender:     full?.gender ?? "—",
      gradeLevel: gradeName ?? "—",
      schoolYear: sy?.year_label ?? "—",
      address:    full?.address ?? "—",
      contact:    full?.contact_number ?? "—",
    },
    topCards: { averageScore, performancePoints, rank },
    completionSummary,
    attendanceSummary,
    subjects,
    grades,
    remarks: { bibleMemory: curRemark?.bible_memory_rating ?? null, readingWpm: curRemark?.reading_wpm ?? null },
    note: curRemark?.supervisor_comments ?? "",
    diagnostic,
    projected,
    monitoring,
    broughtHome: { count: broughtHomeList.length, list: broughtHomeList },
    hundreds:    { count: hundredsList.length, list: hundredsList },
    readyForNext: spList.some((p) => p.ready_for_next === true),
  };
};

const _subjAbbr = (subj = "") => {
  const map = { Mathematics: "MATH", English: "ENG", Science: "SCI", "Word Building": "WB", Filipino: "FIL", "Social Studies": "SS", "Araling Panlipunan": "AP", "Literature and Creative Writing": "LIT" };
  return map[subj] ?? (subj ? subj.slice(0, 3).toUpperCase() : "PACE");
};

// Saves the supervisor's note (student_academic_remarks.supervisor_comments) for the current quarter.
export const saveSupervisorNote = async (user_id, student_id, note) => {
  const { teacher, student } = await _ownedStudent(user_id, student_id);
  const { data: sy } = await supabaseAdmin
    .from("school_year").select("sy_id, start_date").eq("is_active", true).maybeSingle();
  if (!sy) throw new Error("No active school year");
  const quarter = _currentQuarter(sy.start_date);

  const { data: existing } = await supabaseAdmin
    .from("student_academic_remarks")
    .select("sar_id")
    .eq("student_id", student.student_id)
    .eq("sy_id", sy.sy_id)
    .eq("quarter", quarter)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("student_academic_remarks")
      .update({ supervisor_comments: note })
      .eq("sar_id", existing.sar_id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("student_academic_remarks")
      .insert({ student_id: student.student_id, sy_id: sy.sy_id, recorded_by: teacher.teacher_id, quarter, supervisor_comments: note });
    if (error) throw new Error(error.message);
  }
  return { saved: true };
};

// Supervisor edits a student's profile (info card fields). Teacher-scoped via ownership.
export const updateStudentProfile = async (user_id, student_id, fields = {}) => {
  const { student } = await _ownedStudent(user_id, student_id);
  const patch = {};
  const setStr = (k, v) => { if (v !== undefined) patch[k] = v == null ? null : String(v).trim() || null; };
  if (fields.first_name !== undefined) {
    const fn = String(fields.first_name).trim();
    if (!fn) throw new Error("First name is required.");
    patch.first_name = fn;
  }
  if (fields.last_name !== undefined) {
    const ln = String(fields.last_name).trim();
    if (!ln) throw new Error("Last name is required.");
    patch.last_name = ln;
  }
  setStr("date_of_birth", fields.date_of_birth);
  setStr("gender", fields.gender);
  setStr("address", fields.address);
  setStr("contact_number", fields.contact_number);

  if (!Object.keys(patch).length) return { updated: false };
  const { error } = await supabaseAdmin.from("student").update(patch).eq("student_id", student.student_id);
  if (error) throw new Error(error.message);
  return { updated: true };
};

// Supervisor edits one PACE's grade inline in the academic record grid. Sets the PACE
// test score for the student's (subject + pace_number) PACE and re-derives its
// completion/points (>=90 completes it; below reverts to In Progress; blank clears).
export const setPaceScore = async (user_id, { student_id, subject, pace_number, score }) => {
  const { teacher, student } = await _ownedStudent(user_id, student_id);
  const blank = score === "" || score == null;
  const sc = blank ? null : Number(score);
  if (!blank && (isNaN(sc) || sc < 0 || sc > 100)) throw new Error("Score must be between 0 and 100.");

  // Resolve the student's PACE (sp_id) for this subject + module number.
  const { data: sps } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, end_date, extension_count, completion_date, pace_module!inner(subject, module_number)")
    .eq("student_id", student.student_id);
  const sp = (sps ?? []).find((p) =>
    p.pace_module?.subject === subject && String(p.pace_module?.module_number) === String(pace_number));
  if (!sp) throw new Error("This PACE isn't assigned to the student, so it can't be graded.");

  const passed  = !blank && sc >= ASSESS_PASS_MARK;
  const takenOn = new Date().toISOString().split("T")[0];

  // Latest actual (scored) attempt for this PACE, if any.
  const { data: existing } = await supabaseAdmin
    .from("pace_test_result")
    .select("pacetest_id")
    .eq("sp_id", sp.sp_id)
    .not("score", "is", null)
    .order("date_taken", { ascending: false })
    .limit(1);

  if (blank) {
    await supabaseAdmin.from("pace_test_result").delete().eq("sp_id", sp.sp_id).not("score", "is", null);
  } else if (existing?.[0]) {
    const { error } = await supabaseAdmin.from("pace_test_result")
      .update({ score: sc, passed, date_taken: takenOn }).eq("pacetest_id", existing[0].pacetest_id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("pace_test_result")
      .insert({ sp_id: sp.sp_id, score: sc, passed, date_taken: takenOn, recorded_by: teacher.teacher_id });
    if (error) throw new Error(error.message);
  }

  // Re-derive the PACE's completion + points from the new score.
  if (passed) {
    const completionDate = sp.completion_date || takenOn;
    const { completion_status, points_earned } = _computePaceCompletion({
      end_date: sp.end_date, completion_date: completionDate, extension_count: sp.extension_count, passed: true,
    });
    await supabaseAdmin.from("student_pace")
      .update({ status: "Completed", completion_date: completionDate, completion_status, points_earned, ready_for_next: true })
      .eq("sp_id", sp.sp_id);
  } else {
    // failing score or cleared → no longer completed
    await supabaseAdmin.from("student_pace")
      .update({ status: "In Progress", completion_status: null, points_earned: 0, completion_date: null, ready_for_next: false })
      .eq("sp_id", sp.sp_id);
  }
  return { updated: true, passed };
};

// Flags the student's current (or latest) PACE ready_for_next = true.
export const markReadyForNext = async (user_id, student_id) => {
  const { student } = await _ownedStudent(user_id, student_id);
  // Flag the current In Progress PACE (else the most recently assigned) as ready
  const { data: sp } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, assigned_date")
    .eq("student_id", student.student_id)
    .order("assigned_date", { ascending: false });
  const target = (sp ?? []).find((p) => p.status === "In Progress") ?? (sp ?? [])[0];
  if (!target) throw new Error("No PACE to flag for this student");
  const { error } = await supabaseAdmin
    .from("student_pace").update({ ready_for_next: true }).eq("sp_id", target.sp_id);
  if (error) throw new Error(error.message);
  return { ready: true };
};

// ─── Record Assessments (student-centric self-test + PACE-test scoring) ───────
const ASSESS_PASS_MARK = 90;          // PACE test pass + self-test "Ready" gate
const MAX_ATTEMPTS = 3;

// Verify the sp_id belongs to one of the teacher's students; returns teacher row.
async function _ownsSpId(user_id, sp_id) {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher not found");

  const { data: sp } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student(grade_level!inner(teacher_id))")
    .eq("sp_id", Number(sp_id))
    .maybeSingle();
  if (!sp || sp.student?.grade_level?.teacher_id !== teacher.teacher_id) {
    throw new Error("PACE not found or not assigned to this teacher");
  }
  return teacher;
}

// One student's current PACE per subject + their test attempts. Finds the current
// PACE per subject, pulls all self-test + pace-test attempts, and derives each row's
// average/ready/passed flags and status label.
export const getStudentAssessments = async (user_id, student_id) => {
  const { student } = await _ownedStudent(user_id, student_id); // ownership check + student record

  // Every PACE assigned to this student (+ its module info).
  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, status, assigned_date, pace_module(subject, module_number, module_name)")
    .eq("student_id", student.student_id);

  // Current PACE per subject — DETERMINISTIC by PACE number (stable across saves):
  // prefer In Progress, else lowest not-yet-started, else highest completed.
  const _bySubj = new Map();
  (paces ?? []).forEach((p) => {
    const subj = p.pace_module?.subject;
    if (!subj) return;
    (_bySubj.get(subj) ?? _bySubj.set(subj, []).get(subj)).push(p);
  });
  const _num = (p) => p.pace_module?.module_number ?? 0;
  const currentBySubject = new Map();
  _bySubj.forEach((arr, subj) => {
    const inProg    = arr.filter((p) => p.status === "In Progress").sort((a, b) => _num(a) - _num(b));
    const assigned  = arr.filter((p) => p.status === "Assigned").sort((a, b) => _num(a) - _num(b));
    const completed = arr.filter((p) => p.status === "Completed").sort((a, b) => _num(b) - _num(a));
    currentBySubject.set(subj, inProg[0] ?? assigned[0] ?? completed[0] ?? arr[0]);
  });

  const current = [...currentBySubject.values()];      // one current PACE per subject
  const spIds   = current.map((p) => p.sp_id);          // their student_pace ids

  // Fetch all attempts for these PACEs in two batches (self-test + pace-test), then
  //   index each list by sp_id for quick per-row lookup below.
  let selfBySp = new Map(), paceBySp = new Map();
  if (spIds.length) {
    const [{ data: selfRows }, { data: paceRows }] = await Promise.all([
      supabaseAdmin.from("self_test_result").select("sp_id, attempt_no, score, date_taken, passed, recorded_by").in("sp_id", spIds),
      // Only rows with an actual score are real attempts. Schedule/request rows also
      // live in pace_test_result (assessment_status set, score null) — exclude them so
      // a scheduled-but-not-taken test doesn't show as a failed null% attempt.
      supabaseAdmin.from("pace_test_result").select("sp_id, score, date_taken, passed, recorded_by").in("sp_id", spIds).not("score", "is", null).order("date_taken", { ascending: true }),
    ]);
    (selfRows ?? []).forEach((r) => { (selfBySp.get(r.sp_id) ?? selfBySp.set(r.sp_id, []).get(r.sp_id)).push(r); });
    (paceRows ?? []).forEach((r) => { (paceBySp.get(r.sp_id) ?? paceBySp.set(r.sp_id, []).get(r.sp_id)).push(r); });
  }

  const PASS = ASSESS_PASS_MARK;
  // Self-test READY when ANY single attempt scores >= 90 (not the average). avgScore is
  // kept only as an informational figure.
  const avgScore = (arr) => {
    const xs = (arr ?? []).map((r) => r.score).filter((v) => v != null);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
  };
  const passedAny = (arr) => (arr ?? []).some((r) => r.passed === true || (r.score != null && r.score >= PASS));

  const orderIndex = (s) => { const i = PACE_SUBJECT_ORDER.indexOf(s); return i === -1 ? 999 : i; };

  // Build one display row per current PACE: attempts + averages + gating flags + status.
  const rows = current
    .map((p) => {
      const subject     = p.pace_module?.subject ?? "—";
      const selfAtt     = (selfBySp.get(p.sp_id) ?? []).sort((a, b) => (a.attempt_no ?? 0) - (b.attempt_no ?? 0));
      const paceAtt     = (paceBySp.get(p.sp_id) ?? []);
      const selfAvg     = avgScore(selfAtt);                   // informational only
      const selfReady   = passedAny(selfAtt);                  // READY when ANY attempt >= 90
      const selfNeedsIntervention = !selfReady && selfAtt.length >= MAX_ATTEMPTS; // 3 tries, none passed
      const pacePassed  = passedAny(paceAtt);

      // Status precedence: PACE passed > PACE attempted > self-test ready > not ready.
      let status;
      if (pacePassed)            status = "Completed";
      else if (paceAtt.length)   status = "In Progress";
      else if (selfReady)        status = "Ready";
      else                       status = "Not Ready";

      return {
        sp_id:        p.sp_id,
        subject,
        paceNumber:   p.pace_module?.module_number ?? null,
        paceTitle:    p.pace_module?.module_name ?? null,
        selfTest: {
          attempts:    selfAtt.map((r, i) => ({ attempt: r.attempt_no ?? i + 1, score: r.score, date: r.date_taken, passed: r.passed ?? (r.score >= PASS), recordedBy: r.recorded_by ?? null })),
          average:     selfAvg,
          ready:       selfReady,
          attemptsUsed: selfAtt.length,
          canRecord:   !selfReady && selfAtt.length < MAX_ATTEMPTS,   // stop once passed or capped
          needsIntervention: selfNeedsIntervention,                   // 3 failed attempts, none >= 90
          canReset:    selfAtt.length > 0,                            // supervisor can clear + re-record
        },
        paceTest: {
          attempts:    paceAtt.map((r, i) => ({ attempt: i + 1, score: r.score, date: r.date_taken, passed: r.passed ?? (r.score >= PASS), recordedBy: r.recorded_by ?? null })),
          passed:      pacePassed,
          latestScore: paceAtt.length ? paceAtt[paceAtt.length - 1].score : null,  // most recent attempt
          attemptsUsed: paceAtt.length,
          available:   selfReady,                        // unlocked once a self-test attempt passes
          canRecord:   selfReady && paceAtt.length < MAX_ATTEMPTS,
        },
        status,
      };
    })
    .sort((a, b) => orderIndex(a.subject) - orderIndex(b.subject) || a.subject.localeCompare(b.subject));

  return {
    student: { student_id: student.student_id, name: `${student.first_name} ${student.last_name}`.trim(), gradeLevel: student.grade_level?.level_name ?? "—" },
    rows,
    passMark: PASS,
  };
};

// Insert one self-test attempt for a PACE (max 3); returns whether this attempt passed.
export const recordSelfTest = async (user_id, { sp_id, score, date_taken }) => {
  const teacher = await _ownsSpId(user_id, sp_id);     // ownership check (teacher owns this PACE)
  const sc = Number(score);
  if (isNaN(sc) || sc < 0 || sc > 100) throw new Error("Score must be between 0 and 100"); // validate range

  // Count existing attempts to enforce the 3-attempt cap and pick the next attempt #.
  const { data: existing } = await supabaseAdmin
    .from("self_test_result")
    .select("attempt_no")
    .eq("sp_id", Number(sp_id));
  if ((existing?.length ?? 0) >= MAX_ATTEMPTS) throw new Error(`Maximum ${MAX_ATTEMPTS} self-test attempts already recorded`);
  const attempt_no = (existing?.length ?? 0) + 1;

  // Insert the attempt (passed flag is per-attempt: this score >= pass mark).
  const { error } = await supabaseAdmin
    .from("self_test_result")
    .insert({ sp_id: Number(sp_id), attempt_no, score: sc, date_taken: date_taken || new Date().toISOString().split("T")[0], passed: sc >= ASSESS_PASS_MARK, recorded_by: teacher.teacher_id });
  if (error) throw new Error(error.message);
  return { recorded: true, attempt_no, passed: sc >= ASSESS_PASS_MARK };
};

// Reset a student's self-test attempts for a PACE so they can be recorded again.
// Per product decision this CLEARS the attempts (old attempts are not retained).
export const resetSelfTest = async (user_id, { sp_id }) => {
  await _ownsSpId(user_id, sp_id);                     // ownership check (throws if not owned)
  const { error } = await supabaseAdmin
    .from("self_test_result")
    .delete()
    .eq("sp_id", Number(sp_id));
  if (error) throw new Error(error.message);
  return { reset: true };
};

// A student is self-test READY for a PACE when ANY attempt scores >= 90.
async function _selfTestReady(sp_id) {
  const { data: rows } = await supabaseAdmin
    .from("self_test_result")
    .select("score")
    .eq("sp_id", Number(sp_id));
  return (rows ?? []).some((r) => r.score != null && r.score >= ASSESS_PASS_MARK);
}

// Insert one PACE-test attempt (max 3), gated on the self-test average passing. A
// passing score also completes the PACE (below), which feeds Progress/Analytics/Ranking.
export const recordPaceTest = async (user_id, { sp_id, score, date_taken }) => {
  const teacher = await _ownsSpId(user_id, sp_id);     // ownership check
  const sc = Number(score);
  if (isNaN(sc) || sc < 0 || sc > 100) throw new Error("Score must be between 0 and 100"); // validate range

  // Gate: at least one self-test attempt must reach the pass mark first
  if (!(await _selfTestReady(sp_id))) {
    throw new Error("The student must score at least 90% on a self-test before recording a PACE test");
  }

  // Enforce the 3-attempt cap. Count only rows with an actual score — schedule/request
  // rows (score null) share this table and must not consume attempt slots.
  const { data: existing } = await supabaseAdmin
    .from("pace_test_result")
    .select("pacetest_id")
    .eq("sp_id", Number(sp_id))
    .not("score", "is", null);
  if ((existing?.length ?? 0) >= MAX_ATTEMPTS) throw new Error(`Maximum ${MAX_ATTEMPTS} PACE test attempts already recorded`);

  const passed  = sc >= ASSESS_PASS_MARK;               // did this attempt pass?
  const takenOn = date_taken || new Date().toISOString().split("T")[0];

  // Insert the pace-test attempt.
  const { error } = await supabaseAdmin
    .from("pace_test_result")
    .insert({ sp_id: Number(sp_id), score: sc, date_taken: takenOn, passed, recorded_by: teacher.teacher_id });
  if (error) throw new Error(error.message);

  // Passing the PACE test COMPLETES the PACE: mark it Completed + compute points
  // (this is what feeds Student Progress / PACE Analytics / Ranking).
  if (passed) {
    const { data: sp } = await supabaseAdmin
      .from("student_pace")
      .select("sp_id, end_date, extension_count, completion_date")
      .eq("sp_id", Number(sp_id))
      .maybeSingle();
    if (sp) {
      const completionDate = sp.completion_date || takenOn;
      const { completion_status, points_earned } = _computePaceCompletion({
        end_date: sp.end_date, completion_date: completionDate, extension_count: sp.extension_count, passed: true,
      });
      await supabaseAdmin
        .from("student_pace")
        .update({ status: "Completed", completion_date: completionDate, completion_status, points_earned, ready_for_next: true })
        .eq("sp_id", Number(sp_id));
    }
  }

  // Reflect the result in the monitoring grid + notify the student (non-fatal).
  try {
    const { data: spRow } = await supabaseAdmin
      .from("student_pace")
      .select("student_id, pace_module(subject, module_number)")
      .eq("sp_id", Number(sp_id))
      .maybeSingle();
    const subj = spRow?.pace_module?.subject ?? null;
    const num  = spRow?.pace_module?.module_number ?? null;

    // Auto-update the PACE Monitoring icon: pass → Completed, fail → Ongoing.
    if (spRow?.student_id && subj && num != null) {
      await _syncProjectionCell(spRow.student_id, subj, num, passed ? "completed" : "ongoing");
    }

    // Notify the student that their result is now available.
    if (spRow?.student_id) {
      const { data: stu } = await supabaseAdmin
        .from("student")
        .select("user_id")
        .eq("student_id", spRow.student_id)
        .maybeSingle();
      if (stu?.user_id) {
        const paceLabel = [subj, num != null ? `PACE ${num}` : null].filter(Boolean).join(" ") || "your PACE";
        await NotificationService.createForUsers([stu.user_id], {
          title: "PACE Test Result Available",
          message_content: `Your ${paceLabel} test result is now available. View it under Assessment Results.`,
        });
      }
    }
  } catch (e) {
    console.warn("[recordPaceTest] post-record sync/notify failed:", e.message);
  }

  return { recorded: true, passed };
};

export const getSelfTestResults = async (user_id, { subject, quarter }) => {
  const students = await getStudentsForTeacher(user_id);
  if (!students.length) return [];

  const studentIds = students.map((s) => s.student_id);

  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, pace_module!inner(subject, module_number)")
    .in("student_id", studentIds)
    .eq("pace_module.subject", subject);

  if (!paces?.length) return [];

  const spIds  = paces.map((p) => p.sp_id);
  const spInfo = {};
  paces.forEach((p) => {
    spInfo[p.sp_id] = { student_id: p.student_id, pace_number: p.pace_module?.module_number };
  });

  const { data: results } = await supabaseAdmin
    .from("self_test_result")
    .select("sp_id, score, passed, notes, date_taken")
    .in("sp_id", spIds)
    .eq("quarter", Number(quarter));

  return (results ?? []).map((r) => ({
    student_id:  spInfo[r.sp_id]?.student_id,
    pace_number: spInfo[r.sp_id]?.pace_number,
    score:       r.score,
    passed:      r.passed,
    notes:       r.notes      ?? "",
    date_taken:  r.date_taken ?? null,
  }));
};

export const getSelfTestPaceNumbers = async (user_id, { subject, quarter }) => {
  const students = await getStudentsForTeacher(user_id);
  if (!students.length) return [];

  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) return [];

  const studentIds = students.map((s) => s.student_id);

  const { data: projs } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("student_id, pace_start")
    .in("student_id", studentIds)
    .eq("sy_id", sy.sy_id)
    .eq("quarter", Number(quarter))
    .eq("subject", subject);

  return (projs ?? []).map((p) => ({
    student_id:   p.student_id,
    pace_numbers: [p.pace_start, p.pace_start + 1, p.pace_start + 2],
  }));
};

export const bulkSaveSelfTestResults = async (user_id, records) => {
  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) throw new Error("No active school year");

  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher profile not found");

  // Ownership: only the teacher's own students can be scored
  const ownedStudents = await getStudentsForTeacher(user_id);
  const glIdByStudent = new Map(ownedStudents.map((s) => [s.student_id, s.gl_id]));

  let saved = 0;
  const errors = [];

  for (const r of records) {
    const studentId  = Number(r.student_id);
    const quarter    = Number(r.quarter);
    const paceNumber = r.pace_number ? Number(r.pace_number) : null;

    if (!paceNumber) continue;

    const glId = glIdByStudent.get(studentId);
    if (!glId) {
      errors.push(`Student ${studentId}: not assigned to this teacher`);
      continue;
    }

    // Find the student's existing assignment for this PACE number + subject,
    // regardless of which grade level the module was created under
    const { data: spRows } = await supabaseAdmin
      .from("student_pace")
      .select("sp_id, pace_module!inner(module_number, subject)")
      .eq("student_id", studentId)
      .eq("pace_module.module_number", paceNumber)
      .eq("pace_module.subject", r.subject)
      .limit(1);

    let spId = spRows?.[0]?.sp_id ?? null;

    // The PACE number came from the teacher's own projection — if the module or
    // assignment row doesn't exist yet, create it (same as the PACE test save)
    if (!spId) {
      let { data: pm } = await supabaseAdmin
        .from("pace_module")
        .select("module_id")
        .eq("module_number", paceNumber)
        .eq("subject", r.subject)
        .eq("gl_id", glId)
        .maybeSingle();

      if (!pm) {
        const { data: created, error: pmErr } = await supabaseAdmin
          .from("pace_module")
          .insert({ module_name: `${r.subject} PACE ${paceNumber}`, module_number: paceNumber, subject: r.subject, gl_id: glId })
          .select("module_id")
          .single();
        if (pmErr) { errors.push(`Student ${studentId}: failed to create PACE ${paceNumber} — ${pmErr.message}`); continue; }
        pm = created;
      }

      const { data: newSp, error: spErr } = await supabaseAdmin
        .from("student_pace")
        .insert({
          student_id:    studentId,
          teacher_id:    teacher.teacher_id,
          module_id:     pm.module_id,
          assigned_date: r.date_taken ?? new Date().toISOString().split("T")[0],
          status:        "Assigned",
        })
        .select("sp_id")
        .single();
      if (spErr) { errors.push(`Student ${studentId}: failed to assign PACE ${paceNumber} — ${spErr.message}`); continue; }
      spId = newSp.sp_id;
    }

    const payload = {
      sp_id:      spId,
      quarter,
      score:      r.average    ?? null,
      passed:     r.is_ready   ?? null,
      notes:      r.remarks    ?? null,
      date_taken: r.date_taken ?? null,
    };

    const { data: existing } = await SelfTestModel.findBySpAndQuarter(spId, quarter);

    if (existing) {
      const { error: updErr } = await SelfTestModel.updateById(existing.selftest_id, payload);
      if (updErr) { errors.push(`Student ${studentId}: update failed — ${updErr.message}`); continue; }
    } else {
      const { error: insErr } = await SelfTestModel.create({ ...payload, attempt_no: 1 });
      if (insErr) { errors.push(`Student ${studentId}: insert failed — ${insErr.message}`); continue; }
    }

    saved++;
  }

  return { saved, errors };
};

// ─── PACE Test Recording ──────────────────────────────────────────────────────
const PACE_TEST_PASSING = 90;

// Existing official PACE test results for the teacher's students, one entry per
// student+pace_number, for a given subject + quarter.
export const getPaceTestResults = async (user_id, { subject, quarter }) => {
  const students = await getStudentsForTeacher(user_id);
  if (!students.length) return [];

  const studentIds = students.map((s) => s.student_id);

  const { data: paces } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id, student_id, pace_module!inner(subject, module_number)")
    .in("student_id", studentIds)
    .eq("pace_module.subject", subject);

  if (!paces?.length) return [];

  const spIds  = paces.map((p) => p.sp_id);
  const spInfo = {};
  paces.forEach((p) => {
    spInfo[p.sp_id] = { student_id: p.student_id, pace_number: p.pace_module?.module_number };
  });

  const { data: results } = await supabaseAdmin
    .from("pace_test_result")
    .select("sp_id, score, passed, notes, date_taken")
    .in("sp_id", spIds)
    .eq("quarter", Number(quarter));

  return (results ?? []).map((r) => ({
    student_id:  spInfo[r.sp_id]?.student_id,
    pace_number: spInfo[r.sp_id]?.pace_number,
    score:       r.score,
    passed:      r.passed,
    notes:       r.notes ?? "",
    date_taken:  r.date_taken ?? null,
  }));
};

export const bulkSavePaceTestResults = async (user_id, records) => {
  const { data: teacher } = await supabaseAdmin
    .from("teacher")
    .select("teacher_id")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!teacher) throw new Error("Teacher profile not found");

  // Ownership: only the teacher's own students can be scored
  const ownedStudents = await getStudentsForTeacher(user_id);
  const glIdByStudent = new Map(ownedStudents.map((s) => [s.student_id, s.gl_id]));

  let saved = 0;
  const errors = [];
  const notifyTargets = []; // { studentId, subject, paceNumber } per saved result

  for (const r of records) {
    const studentId  = Number(r.student_id);
    const quarter    = Number(r.quarter);
    const paceNumber = r.pace_number ? Number(r.pace_number) : null;
    const score      = Number(r.score);

    if (!paceNumber || isNaN(score)) continue;

    const glId = glIdByStudent.get(studentId);
    if (!glId) {
      errors.push(`Student ${studentId}: not assigned to this teacher`);
      continue;
    }

    // Find the student's existing assignment for this PACE number + subject,
    // regardless of which grade level the module was created under
    const { data: spRows } = await supabaseAdmin
      .from("student_pace")
      .select("sp_id, pace_module!inner(module_number, subject)")
      .eq("student_id", studentId)
      .eq("pace_module.module_number", paceNumber)
      .eq("pace_module.subject", r.subject)
      .limit(1);

    let spId = spRows?.[0]?.sp_id ?? null;

    // The PACE number came from the teacher's own projection — if the module or
    // assignment row doesn't exist yet, create it (same as updatePaceProjectionCell)
    if (!spId) {
      let { data: pm } = await supabaseAdmin
        .from("pace_module")
        .select("module_id")
        .eq("module_number", paceNumber)
        .eq("subject", r.subject)
        .eq("gl_id", glId)
        .maybeSingle();

      if (!pm) {
        const { data: created, error: pmErr } = await supabaseAdmin
          .from("pace_module")
          .insert({ module_name: `${r.subject} PACE ${paceNumber}`, module_number: paceNumber, subject: r.subject, gl_id: glId })
          .select("module_id")
          .single();
        if (pmErr) { errors.push(`Student ${studentId}: failed to create PACE ${paceNumber} — ${pmErr.message}`); continue; }
        pm = created;
      }

      const { data: newSp, error: spErr } = await supabaseAdmin
        .from("student_pace")
        .insert({
          student_id:    studentId,
          teacher_id:    teacher.teacher_id,
          module_id:     pm.module_id,
          assigned_date: r.date_taken ?? new Date().toISOString().split("T")[0],
          status:        "Assigned",
        })
        .select("sp_id")
        .single();
      if (spErr) { errors.push(`Student ${studentId}: failed to assign PACE ${paceNumber} — ${spErr.message}`); continue; }
      spId = newSp.sp_id;
    }

    const payload = {
      sp_id:       spId,
      quarter,
      score,
      passed:      score >= PACE_TEST_PASSING,
      notes:       r.notes ?? null,
      date_taken:  r.date_taken ?? null,
      recorded_by: teacher.teacher_id,
    };

    const { data: existing } = await PaceTestModel.findBySpAndQuarter(spId, quarter);

    if (existing) {
      const { error: updErr } = await PaceTestModel.updateById(existing.pacetest_id, payload);
      if (updErr) { errors.push(`Student ${studentId}: update failed — ${updErr.message}`); continue; }
    } else {
      const { error: insErr } = await PaceTestModel.create(payload);
      if (insErr) { errors.push(`Student ${studentId}: insert failed — ${insErr.message}`); continue; }
    }

    // Keep student_pace.status in sync with the recorded score — mirrors the
    // single-record recordPaceTest (~2787). Without this, bulk-recorded scores
    // never flip the PACE to Completed/In Progress, so the Student Profile and
    // Academic Recording views show stale completed/ongoing counts.
    if (payload.passed) {
      // Passing the PACE test COMPLETES the PACE (+ computes completion status/points).
      const { data: sp } = await supabaseAdmin
        .from("student_pace")
        .select("end_date, extension_count, completion_date")
        .eq("sp_id", spId)
        .maybeSingle();
      const completionDate = sp?.completion_date || payload.date_taken || new Date().toISOString().split("T")[0];
      const { completion_status, points_earned } = _computePaceCompletion({
        end_date: sp?.end_date, completion_date: completionDate, extension_count: sp?.extension_count ?? 0, passed: true,
      });
      await supabaseAdmin
        .from("student_pace")
        .update({ status: "Completed", completion_date: completionDate, completion_status, points_earned, ready_for_next: true })
        .eq("sp_id", spId);
    } else {
      // A recorded-but-not-passed attempt means the PACE is being worked on (ongoing),
      // not untouched — reflect that, but never downgrade an already-completed PACE.
      await supabaseAdmin
        .from("student_pace")
        .update({ status: "In Progress" })
        .eq("sp_id", spId)
        .neq("status", "Completed");
    }

    saved++;
    notifyTargets.push({ studentId, subject: r.subject, paceNumber });
  }

  // Notify each student that their PACE test result is now available (non-fatal).
  if (notifyTargets.length) {
    try {
      const ids = [...new Set(notifyTargets.map((t) => t.studentId))];
      const { data: stus } = await supabaseAdmin
        .from("student").select("student_id, user_id").in("student_id", ids);
      const uidByStudent = new Map((stus ?? []).map((s) => [s.student_id, s.user_id]));
      for (const t of notifyTargets) {
        const uid = uidByStudent.get(t.studentId);
        if (!uid) continue;
        const paceLabel = [t.subject, t.paceNumber != null ? `PACE ${t.paceNumber}` : null].filter(Boolean).join(" ") || "your PACE";
        await NotificationService.createForUsers([uid], {
          title: "PACE Test Result Available",
          message_content: `Your ${paceLabel} test result is now available. View it under Assessment Results.`,
        });
      }
    } catch (e) {
      console.warn("[bulkSavePaceTestResults] result notifications failed:", e.message);
    }
  }

  return { saved, errors };
};

export const deleteTeacher = async (teacher_id) => {
  const { data: teacher, error: findError } = await TeacherModel.findById(teacher_id);
  if (findError || !teacher) throw new Error("Teacher not found");

  const { data: userProfile } = await UserModel.findById(teacher.user_id);

  const { error } = await TeacherModel.remove(teacher_id);
  if (error) throw new Error(error.message);

  if (userProfile?.auth_id) {
    await supabaseAdmin.auth.admin.deleteUser(userProfile.auth_id);
  }
};
