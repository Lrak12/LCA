import * as ReportsModel from "../models/reports.model.js";
import { supabaseAdmin } from "../config/supabase.js";
import { getEligibleUserIds, getSchoolYear } from "./schoolYearStatus.service.js";

const QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

const buildEnrollmentTrends = (students = []) => {
  const years = Array.from({ length: 6 }, (_, index) => currentYear - 5 + index);
  const counts = new Map(years.map((year) => [year, 0]));
  students.forEach((student) => {
    if (!student.enrollment_date) return;
    const year = new Date(student.enrollment_date).getFullYear();
    if (counts.has(year)) counts.set(year, counts.get(year) + 1);
  });
  return years.map((year) => ({ year, count: counts.get(year) || 0 }));
};

const buildAcademicPerformance = (paces = []) => {
  const groups = new Map();
  paces.forEach((pace) => {
    const grade = pace.pace_module?.grade_level?.level_name || "Unassigned";
    const current = groups.get(grade) || { grade, total: 0, completed: 0 };
    current.total += 1;
    if (pace.status === "Completed") current.completed += 1;
    groups.set(grade, current);
  });
  const rows = [...groups.values()]
    .map((group) => ({
      grade: group.grade,
      average: group.total ? Math.round((group.completed / group.total) * 100) : 0,
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));
  return rows.length > 0
    ? rows
    : [
        { grade: "G1-3", average: 0 },
        { grade: "G4-6", average: 0 },
        { grade: "G7-9", average: 0 },
        { grade: "G10-12", average: 0 },
        { grade: "SPED", average: 0 },
      ];
};

/**
 * Compute the date range for a given quarter (1-4) within a school year.
 * The school year is split into 4 equal 3-month blocks from start_date.
 */
function getQuarterDateRange(syStart, quarter) {
  const start = new Date(syStart);
  const baseMonth = start.getMonth() + (quarter - 1) * 3;
  const baseYear  = start.getFullYear();

  const months = Array.from({ length: 3 }, (_, i) => {
    const totalMonth = baseMonth + i;
    const year  = baseYear + Math.floor(totalMonth / 12);
    const month = totalMonth % 12;
    return {
      label:     new Date(year, month, 1).toLocaleString("en-US", { month: "long" }),
      year,
      monthIndex: month,
      startDate: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      endDate:   `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`,
    };
  });

  return {
    months,
    rangeStart: months[0].startDate,
    rangeEnd:   months[2].endDate,
  };
}

/** Format student name as "Last, First" */
const formatName = (s) => `${s.last_name}, ${s.first_name}`;

/** Today's date as YYYY-MM-DD in LOCAL time (toISOString() would shift to UTC) */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Get students assigned to a teacher via:
 *   teacher → grade_level (teacher_id FK) → student (gl_id FK)
 */
async function getStudentsForTeacher(teacher_id, sy_id = null) {
  const sy = await getSchoolYear(sy_id);

  // History is the reliable source after assignments have changed.
  const { data: historyRows } = await supabaseAdmin
    .from("student_supervisor_history")
    .select("student_id, gl_id, grade_level_name, student(first_name, last_name)")
    .eq("teacher_id", teacher_id)
    .eq("sy_id", sy.sy_id);

  if (historyRows?.length) {
    const students = [];
    const seenStudents = new Set();
    const levelMap = new Map();
    historyRows.forEach((row) => {
      if (row.student && !seenStudents.has(row.student_id)) {
        seenStudents.add(row.student_id);
        students.push({ student_id: row.student_id, gl_id: row.gl_id, ...row.student });
      }
      const key = row.gl_id ?? row.grade_level_name;
      if (key != null && !levelMap.has(key)) {
        levelMap.set(key, { gl_id: row.gl_id, level_name: row.grade_level_name ?? "Unassigned" });
      }
    });
    return { students, gradeLevels: [...levelMap.values()] };
  }

  const { data: gradeLevels, error } = await ReportsModel.findGradeLevelsByTeacherId(teacher_id, sy.sy_id);
  if (error) return { students: [], gradeLevels: [] };

  const glIds = (gradeLevels ?? []).map((gl) => gl.gl_id);
  // Fail closed: a teacher with no assigned grade level has no students
  if (!glIds.length) return { students: [], gradeLevels: [] };

  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id")
    .in("gl_id", glIds)
    .order("last_name");

  return { students: students ?? [], gradeLevels: gradeLevels ?? [] };
}

// ── Public service functions ──────────────────────────────────────────────────

export const getReportsOverview = async () => {
  const [
    { data: students, error: studentsError },
    { data: paces,    error: pacesError    },
    { count: teachers, error: teachersError },
  ] = await Promise.all([
    ReportsModel.findStudents(),
    ReportsModel.findStudentPaces(),
    ReportsModel.countTeachers(),
  ]);

  if (studentsError)  throw new Error(studentsError.message);
  if (pacesError)     throw new Error(pacesError.message);
  if (teachersError)  throw new Error(teachersError.message);

  const enrollmentTrends    = buildEnrollmentTrends(students || []);
  const academicPerformance = buildAcademicPerformance(paces   || []);
  const first  = enrollmentTrends[0]?.count || 0;
  const latest = enrollmentTrends.at(-1)?.count || 0;
  const growth = first === 0
    ? (latest > 0 ? 100 : 0)
    : Math.round(((latest - first) / first) * 100);

  return {
    categories: [
      { icon: "group_add",  title: "Enrollment Reports",  items: ["New vs. Returning", "Withdrawal Rates", "Cohort Trends"] },
      { icon: "menu_book",  title: "Academic Reports",    items: ["Grade Distribution", "PACE Completion", "Subject Mastery"] },
      { icon: "payments",   title: "Financial Reports",   items: ["Tuition Collection", "Outstanding Balances", "Expense Analysis"] },
      { icon: "groups",     title: "Personnel Reports",   items: ["Faculty Attendance", "Faculty Load", "Certification Tracking"] },
    ],
    enrollmentTrends,
    academicPerformance,
    summary: {
      enrollmentGrowth: growth,
      averageMastery: academicPerformance.length
        ? Math.round(academicPerformance.reduce((sum, item) => sum + item.average, 0) / academicPerformance.length)
        : 0,
      facultyCount: teachers || 0,
    },
  };
};

// ── Teachers list ─────────────────────────────────────────────────────────────

export const getSchoolYears = async () => {
  const { data, error } = await supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date, end_date, is_active")
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const getTeachers = async (sy_id = null) => {
  const sy = await getSchoolYear(sy_id);
  const eligible = await getEligibleUserIds(sy.sy_id, "teacher");
  const { data: teachers, error } = await ReportsModel.findAllTeachers();
  if (error) throw new Error(error.message);

  const { data: historyRows } = await supabaseAdmin
    .from("student_supervisor_history")
    .select("teacher_id, gl_id, grade_level_name")
    .eq("sy_id", sy.sy_id);
  const historyTeacherIds = new Set((historyRows ?? []).map((row) => row.teacher_id));
  const levelsByTeacher = new Map();
  (historyRows ?? []).forEach((row) => {
    const levels = levelsByTeacher.get(row.teacher_id) ?? new Map();
    const key = row.gl_id ?? row.grade_level_name;
    if (key != null) levels.set(key, { gl_id: row.gl_id, level_name: row.grade_level_name ?? "Unassigned" });
    levelsByTeacher.set(row.teacher_id, levels);
  });

  const selectedTeachers = (teachers ?? []).filter((teacher) =>
    eligible.has(teacher.user_id) && (sy.is_active || historyTeacherIds.has(teacher.teacher_id))
  );

  // For each teacher, fetch their assigned grade levels
  const withLevels = await Promise.all(
    selectedTeachers.map(async (t) => {
      let levels = [...(levelsByTeacher.get(t.teacher_id)?.values() ?? [])];
      if (!levels.length) {
        const { data: gradeLevels } = await ReportsModel.findGradeLevelsByTeacherId(t.teacher_id, sy.sy_id);
        levels = gradeLevels ?? [];
      }
      const dept   = levels.length
        ? levels.map((gl) => gl.level_name).join(", ")
        : "No grade level assigned";
      return {
        teacher_id:  t.teacher_id,
        firstName:   t.first_name,
        lastName:    t.last_name,
        dept,
        gradeLevels: levels,
        schoolYear: sy.year_label,
      };
    })
  );

  return withLevels;
};


// ── Class Academic Record ─────────────────────────────────────────────────────

/**
 * Shared computation for the Class Academic Record.
 * Used by BOTH the preview (getTeacherAcademicReport) and the submit
 * (saveAcademicReport) so what the teacher reviews is exactly what is saved.
 * Returns { students, gradeLevels, metrics } where metrics is keyed by student_id.
 */
async function computeAcademicMetrics(teacher_id, quarter, sy) {
  const { rangeStart, rangeEnd } = getQuarterDateRange(sy.start_date, quarter);
  const today  = localToday();
  const attEnd = today < rangeEnd ? today : rangeEnd; // only days entered so far

  const { students, gradeLevels } = await getStudentsForTeacher(teacher_id);
  if (!students.length) return { students, gradeLevels, metrics: new Map() };

  const studentIds = students.map((s) => s.student_id);

  const [{ data: projRows }, { data: allPaces }, { data: attRows }, { data: hwRows }] = await Promise.all([
    ReportsModel.findPaceProjectionsForReport(studentIds, quarter, sy.sy_id),
    ReportsModel.findPacesForStudents(studentIds),       // for pace_test_result lookup via sp_id
    ReportsModel.findAttendanceByTeacherAndRange(teacher_id, rangeStart, attEnd),
    ReportsModel.findPaceStatusesByStudents(studentIds, sy.sy_id),
  ]);

  // PACE counts from pace_quarterly_projection (source of truth)
  const paceCountByStudent = new Map(); // student_id → total pace_count for the quarter
  (projRows ?? []).forEach((p) => {
    paceCountByStudent.set(p.student_id, (paceCountByStudent.get(p.student_id) ?? 0) + (p.pace_count ?? 0));
  });

  // 100s from pace_test_result via student_pace sp_ids
  const paces = allPaces ?? [];
  const spIds = paces.map((p) => p.sp_id);

  let allResults = [];
  if (spIds.length) {
    const { data } = await ReportsModel.findPaceTestResultsForPaces(spIds);
    allResults = data ?? [];
  }
  const quarterResults = allResults.filter((r) => r.quarter === quarter);

  // sp_id → student_id map
  const spToStudent = new Map();
  paces.forEach((p) => spToStudent.set(p.sp_id, p.student_id));

  // Count 100s this quarter per student
  const h100ByStudent = new Map();
  quarterResults.forEach((r) => {
    if (r.score === 100) {
      const sid = spToStudent.get(r.sp_id);
      if (sid) h100ByStudent.set(sid, (h100ByStudent.get(sid) ?? 0) + 1);
    }
  });

  // Cumulative 100s across ALL quarters per student
  const cum100ByStudent = new Map();
  allResults.forEach((r) => {
    if (r.score === 100) {
      const sid = spToStudent.get(r.sp_id);
      if (sid) cum100ByStudent.set(sid, (cum100ByStudent.get(sid) ?? 0) + 1);
    }
  });

  // Average score this quarter per student
  const qScoresByStudent = new Map();
  quarterResults.forEach((r) => {
    const sid = spToStudent.get(r.sp_id);
    if (sid) {
      const list = qScoresByStudent.get(sid) ?? [];
      list.push(r.score);
      qScoresByStudent.set(sid, list);
    }
  });

  const attByStudent = new Map();
  (attRows ?? []).forEach((a) => {
    const list = attByStudent.get(a.student_id) ?? [];
    list.push(a);
    attByStudent.set(a.student_id, list);
  });

  // Homework = taken-home PACE statuses from pace_quarterly_projection
  const hwByStudent = new Map();
  (hwRows ?? []).forEach((p) => {
    const count = [p.status_r0, p.status_r1, p.status_r2].filter((s) => s === "taken-home").length;
    hwByStudent.set(p.student_id, (hwByStudent.get(p.student_id) ?? 0) + count);
  });

  const metrics = new Map();
  students.forEach((student) => {
    const sid = student.student_id;
    const att = attByStudent.get(sid) ?? [];

    const qScores  = qScoresByStudent.get(sid) ?? [];
    const avgScore = qScores.length
      ? Math.round((qScores.reduce((a, b) => a + b, 0) / qScores.length) * 10) / 10
      : 0;
    const hrGrade = avgScore >= 97 ? "A" : avgScore >= 95 ? "B" : null;
    const tard = att.filter((a) => ["tardy", "late"].includes((a.status || "").toLowerCase())).length;
    const abs  = att.filter((a) => (a.status || "").toLowerCase() === "absent").length;

    metrics.set(sid, {
      paces:    paceCountByStudent.get(sid) ?? 0,
      avgScore,
      h100:     h100ByStudent.get(sid) ?? 0,
      cum100:   cum100ByStudent.get(sid) ?? 0,
      hrGrade,
      tard,
      abs,
      hwDays:   hwByStudent.get(sid) ?? 0,
    });
  });

  return { students, gradeLevels, metrics };
}

export const getTeacherAcademicReport = async (teacher_id, quarter = 1, sy_id = null) => {
  const sy = await getSchoolYear(sy_id);
  const syLabel = sy?.year_label ?? `${currentYear - 1}–${currentYear}`;
  const qLabel  = QUARTER_LABELS[quarter - 1] ?? `Quarter ${quarter}`;

  // Previous years use the submitted snapshot instead of recalculating old data.
  if (!sy.is_active) {
    const [{ data: savedRows }, { gradeLevels }] = await Promise.all([
      ReportsModel.findAcademicSummaryForTeacher(teacher_id, quarter, sy.sy_id),
      getStudentsForTeacher(teacher_id, sy.sy_id),
    ]);
    const students = (savedRows ?? []).map((row) => ({
      name: row.student ? `${row.student.last_name}, ${row.student.first_name}` : `Student ${row.student_id}`,
      paces: row.total_paces ?? 0,
      cum: row.cumulative_score ?? 0,
      h100: row.count_perfect_100s ?? 0,
      cum100: row.cumulative_100s ?? 0,
      ave: row.average_score ?? 0,
      hr: row.honor_roll_status ?? "None",
      tard: row.tardiness_count ?? 0,
      abs: row.absence_count ?? 0,
      dmts: row.demerit_count ?? 0,
      days: row.homework_skip_days ?? 0,
      s1: row.scripture_1st_recited ?? false,
      s2: row.scripture_2nd_recited ?? false,
    }));
    return { quarterLabel: qLabel, schoolYear: syLabel, gradeLevels, students };
  }

  const { students, gradeLevels, metrics } = await computeAcademicMetrics(teacher_id, quarter, sy);
  if (!students.length) return { quarterLabel: qLabel, schoolYear: syLabel, gradeLevels: [], students: [] };

  const rows = students.map((student) => {
    const m = metrics.get(student.student_id);
    return {
      name:   formatName(student),
      paces:  m.paces,
      cum:    m.avgScore,
      h100:   m.h100,
      cum100: m.cum100,
      ave:    m.avgScore,
      hr:     m.hrGrade,
      tard:   m.tard,
      abs:    m.abs,
      dmts:   0,
      days:   m.hwDays,
      s1:     false,
      s2:     false,
    };
  });

  return { quarterLabel: qLabel, schoolYear: syLabel, gradeLevels, students: rows };
};

// ── PACE Progress Report ──────────────────────────────────────────────────────

const PACE_SUBJECT_ORDER = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];

function deriveSubjectStatus(proj) {
  if (!proj) return "not-started";
  const statuses = [proj.status_r0, proj.status_r1, proj.status_r2];
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.every((s) => !s || s === "not-started")) return "not-started";
  return "ongoing";
}

function paceRange(proj) {
  if (!proj?.pace_start) return "—";
  const end = proj.pace_end ?? (proj.pace_start + (proj.pace_count ?? 1) - 1);
  return end > proj.pace_start ? `${proj.pace_start}–${end}` : `${proj.pace_start}`;
}

export const getTeacherPaceProgressReport = async (teacher_id, quarter = 1) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  const syLabel = sy?.year_label ?? `${currentYear - 1}–${currentYear}`;
  const qLabel  = QUARTER_LABELS[quarter - 1] ?? `Quarter ${quarter}`;
  if (!sy) return { quarterLabel: qLabel, schoolYear: syLabel, gradeLevels: [], subjects: PACE_SUBJECT_ORDER, students: [] };

  const { students, gradeLevels } = await getStudentsForTeacher(teacher_id);
  const studentIds = students.map((s) => s.student_id);

  const projMap = new Map(); // student_id → subject → row
  if (studentIds.length) {
    const { data: projRows } = await ReportsModel.findPaceProjectionsForReport(studentIds, quarter, sy.sy_id);
    (projRows ?? []).forEach((p) => {
      if (!projMap.has(p.student_id)) projMap.set(p.student_id, new Map());
      projMap.get(p.student_id).set(p.subject, p);
    });
  }

  const rows = students.map((student) => {
    const subjectMap = projMap.get(student.student_id) ?? new Map();
    const subjects   = PACE_SUBJECT_ORDER.map((subj) => {
      const proj = subjectMap.get(subj) ?? null;
      return { subject: subj, range: paceRange(proj), count: proj?.pace_count ?? 0, status: deriveSubjectStatus(proj) };
    });
    return { name: formatName(student), subjects, total: subjects.reduce((s, p) => s + p.count, 0) };
  });

  return { quarterLabel: qLabel, schoolYear: syLabel, gradeLevels, subjects: PACE_SUBJECT_ORDER, students: rows };
};

// ── Attendance Report ─────────────────────────────────────────────────────────

export const getTeacherAttendanceReport = async (teacher_id, quarter = 4, sy_id = null) => {
  const sy = await getSchoolYear(sy_id);
  const syLabel = sy?.year_label ?? `${currentYear - 1}–${currentYear}`;
  const qLabel  = QUARTER_LABELS[quarter - 1] ?? `Quarter ${quarter}`;

  const { months, rangeStart } = getQuarterDateRange(sy.start_date, quarter);
  const { students, gradeLevels } = await getStudentsForTeacher(teacher_id, sy.sy_id);

  if (!sy.is_active) {
    const monthNumbers = months.map((month) => month.monthIndex + 1);
    const { data: savedRows } = await ReportsModel.findAttendanceSummaryByTeacher(
      teacher_id,
      monthNumbers,
      sy.sy_id,
    );
    const rowsByStudent = new Map();
    (savedRows ?? []).forEach((row) => {
      const item = rowsByStudent.get(row.student_id) ?? {
        name: row.student ? `${row.student.last_name}, ${row.student.first_name}` : `Student ${row.student_id}`,
        values: new Map(),
        demerits: 0,
        hw: 0,
      };
      item.values.set(row.month, row);
      item.demerits += row.demerit_total ?? 0;
      item.hw += row.homework_days ?? 0;
      rowsByStudent.set(row.student_id, item);
    });
    const savedStudents = [...rowsByStudent.values()].map((item) => ({
      name: item.name,
      months: monthNumbers.map((month, index) => {
        const row = item.values.get(month) ?? {};
        return {
          month: months[index].label,
          present: row.present_count ?? 0,
          absent: row.absent_count ?? 0,
          tardy: row.tardy_count ?? 0,
        };
      }),
      demerits: item.demerits,
      hw: item.hw,
    }));
    return {
      quarterLabel: qLabel,
      schoolYear: syLabel,
      months: months.map((month) => month.label),
      gradeLevels,
      students: savedStudents,
    };
  }

  // Only fetch up to today — teacher previews what has been entered so far
  const rangeEnd = localToday();

  const { data: attRows } = await ReportsModel.findAttendanceByTeacherAndRange(
    teacher_id, rangeStart, rangeEnd
  );

  // Build student list: grade-level students first; fall back to unique students in att rows
  let resolvedStudents = students;
  if (!resolvedStudents.length && attRows?.length) {
    const seen = new Map();
    (attRows ?? []).forEach((a) => {
      if (!seen.has(a.student_id) && a.student)
        seen.set(a.student_id, { student_id: a.student_id, first_name: a.student.first_name, last_name: a.student.last_name });
    });
    resolvedStudents = [...seen.values()];
  }

  // Group raw rows by student → monthIndex
  const attMap = new Map();
  (attRows ?? []).forEach((a) => {
    const monthIdx = new Date(a.date_recorded).getMonth();
    if (!attMap.has(a.student_id)) attMap.set(a.student_id, new Map());
    const monthMap = attMap.get(a.student_id);
    if (!monthMap.has(monthIdx)) monthMap.set(monthIdx, { p: 0, a: 0, t: 0 });
    const bucket = monthMap.get(monthIdx);
    const status = (a.status || "").toLowerCase();
    if      (status === "present")                    bucket.p++;
    else if (status === "absent")                     bucket.a++;
    else if (status === "tardy" || status === "late") bucket.t++;
  });

  // Count homework (taken-home PACEs) directly from pace_quarterly_projection
  const studentIds = resolvedStudents.map((s) => s.student_id);
  const hwByStudent = new Map(); // student_id → count
  if (studentIds.length) {
    const { data: paceRows } = await ReportsModel.findPaceStatusesByStudents(studentIds, sy.sy_id);
    (paceRows ?? []).forEach((p) => {
      const count = [p.status_r0, p.status_r1, p.status_r2].filter((s) => s === "taken-home").length;
      hwByStudent.set(p.student_id, (hwByStudent.get(p.student_id) ?? 0) + count);
    });
  }

  const rows = resolvedStudents.map((student) => {
    const monthMap = attMap.get(student.student_id) ?? new Map();
    return {
      name:     formatName(student),
      months:   months.map((m) => {
        const b = monthMap.get(m.monthIndex) ?? { p: 0, a: 0, t: 0 };
        return { month: m.label, present: b.p, absent: b.a, tardy: b.t };
      }),
      demerits: 0,
      hw:       hwByStudent.get(student.student_id) ?? 0,
    };
  });

  return {
    quarterLabel: qLabel,
    schoolYear:   syLabel,
    months:       months.map((m) => m.label),
    gradeLevels,
    students:     rows,
  };
};

// ── Report Submission ─────────────────────────────────────────────────────────
// Each save helper computes the data (reusing the same logic as the view
// functions) and upserts it directly into the corresponding report table.

async function saveAcademicReport(teacher_id, quarter, sy) {
  // Same computation as the preview — what the teacher reviewed is what gets saved
  const { students, metrics } = await computeAcademicMetrics(teacher_id, quarter, sy);
  if (!students.length) return;

  const rows = students.map((student) => {
    const m = metrics.get(student.student_id);
    return {
      student_id:            student.student_id,
      sy_id:                 sy.sy_id,
      recorded_by:           teacher_id,
      quarter,
      total_paces:           m.paces,
      cumulative_score:      m.avgScore,
      count_perfect_100s:    m.h100,
      cumulative_100s:       m.cum100,
      average_score:         m.avgScore,
      honor_roll_status:     m.hrGrade,
      tardiness_count:       m.tard,
      absence_count:         m.abs,
      demerit_count:         0,
      homework_skip_days:    m.hwDays,
      scripture_1st_recited: false,
      scripture_2nd_recited: false,
    };
  });

  const { error } = await ReportsModel.upsertClassAcademicSummary(rows);
  if (error) throw new Error(error.message);
}

async function saveAttendanceReport(teacher_id, quarter, sy) {
  const { months, rangeStart, rangeEnd } = getQuarterDateRange(sy.start_date, quarter);
  const { students } = await getStudentsForTeacher(teacher_id);
  const { data: attRows } = await ReportsModel.findAttendanceByTeacherAndRange(teacher_id, rangeStart, rangeEnd);

  let resolvedStudents = students;
  if (!resolvedStudents.length && attRows?.length) {
    const seen = new Map();
    (attRows ?? []).forEach((a) => {
      if (!seen.has(a.student_id) && a.student)
        seen.set(a.student_id, { student_id: a.student_id, first_name: a.student.first_name, last_name: a.student.last_name });
    });
    resolvedStudents = [...seen.values()];
  }

  const attMap = new Map();
  (attRows ?? []).forEach((a) => {
    const monthIdx = new Date(a.date_recorded).getMonth();
    if (!attMap.has(a.student_id)) attMap.set(a.student_id, new Map());
    const monthMap = attMap.get(a.student_id);
    if (!monthMap.has(monthIdx)) monthMap.set(monthIdx, { p: 0, a: 0, t: 0 });
    const bucket = monthMap.get(monthIdx);
    const status = (a.status || "").toLowerCase();
    if (status === "present")                         bucket.p++;
    else if (status === "absent")                     bucket.a++;
    else if (status === "tardy" || status === "late") bucket.t++;
  });

  // Count homework from pace_quarterly_projection (source of truth)
  const studentIds = resolvedStudents.map((s) => s.student_id);
  const hwByStudent = new Map(); // student_id → total taken-home count for the quarter
  if (studentIds.length) {
    const { data: paceRows } = await ReportsModel.findPaceStatusesByStudents(studentIds, sy.sy_id);
    (paceRows ?? []).forEach((p) => {
      const count = [p.status_r0, p.status_r1, p.status_r2].filter((s) => s === "taken-home").length;
      hwByStudent.set(p.student_id, (hwByStudent.get(p.student_id) ?? 0) + count);
    });
  }

  const rows = [];
  resolvedStudents.forEach((student) => {
    const monthMap = attMap.get(student.student_id) ?? new Map();
    months.forEach((m) => {
      const b = monthMap.get(m.monthIndex) ?? { p: 0, a: 0, t: 0 };
      rows.push({
        student_id:    student.student_id,
        sy_id:         sy.sy_id,
        recorded_by:   teacher_id,
        month:         m.monthIndex + 1,
        present_count: b.p,
        absent_count:  b.a,
        tardy_count:   b.t,
        demerit_total: 0,
        homework_days: hwByStudent.get(student.student_id) ?? 0,
      });
    });
  });

  if (rows.length) {
    const { error } = await ReportsModel.upsertAttendanceMonthlySummary(rows);
    if (error) throw new Error(error.message);
  }
}

async function savePaceReport(teacher_id, quarter, sy) {
  // Submitting marks the existing projection rows as recorded — it must never
  // recompute or overwrite the teacher's PACE plan (AssignPace/PaceMonitoring
  // use the same table as their source of truth).
  const { students } = await getStudentsForTeacher(teacher_id);
  if (!students.length) return;

  const studentIds = students.map((s) => s.student_id);
  const { data, error } = await ReportsModel.stampPaceProjectionSubmitted(studentIds, sy.sy_id, quarter, teacher_id);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const submitReport = async (teacher_id, report_type, quarter) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  if (!sy) throw new Error("No active school year found");

  const allowedTypes = new Set(["academic", "attendance", "pace", "analytics"]);
  if (!allowedTypes.has(report_type)) throw new Error(`Unknown report_type: ${report_type}`);

  const quarters = [1, 2, 3, 4];
  for (const reportQuarter of quarters) {
    if (report_type === "academic") await saveAcademicReport(teacher_id, reportQuarter, sy);
    else if (report_type === "attendance") await saveAttendanceReport(teacher_id, reportQuarter, sy);
    else if (report_type === "pace") await savePaceReport(teacher_id, reportQuarter, sy);
    // Analytics is calculated from live PACE data, so it needs only a durable
    // publication record and no duplicate snapshot rows.
  }

  const submittedAt = new Date().toISOString();
  const rows = quarters.map((reportQuarter) => ({
    teacher_id,
    sy_id: sy.sy_id,
    report_type,
    quarter: reportQuarter,
    submitted_at: submittedAt,
  }));
  const { data, error } = await ReportsModel.upsertReportSubmissions(rows);
  if (error) throw new Error(error.message);

  return { report_type, quarter, quarters, teacher_id, submitted_at: submittedAt, submissions: data ?? [] };
};

export const getSubmissionStatuses = async (quarter, report_type, sy_id = null) => {
  const sy = await getSchoolYear(sy_id);
  const allowedTypes = new Set(["academic", "attendance", "pace", "analytics"]);
  if (!allowedTypes.has(report_type)) return {};

  const { data, error } = await ReportsModel.findReportSubmissions(report_type, quarter, sy.sy_id);
  if (error) throw new Error(error.message);

  // Build map: teacher_id → submitted_at
  const map = {};
  (data ?? []).forEach((row) => { map[row.teacher_id] = row.submitted_at; });
  return map;
};

// ── Assign PACE (teacher) ─────────────────────────────────────────────────────
// Takes a teacher_id, student_id and subject→startPace map.
// Generates 4 quarterly rows in pace_quarterly_projection (6 PACEs/quarter default).
// generatePaceProjection - upserts a student's projected PACE plan into
//   pace_quarterly_projection. Accepts either the old flat { subject: startPace }
//   or the full { subject: { "1": {start,count}, ... } } grid. SHARED save target
//   for: AssignPace, PACE Monitoring (assign), Returning Student Placement, and the
//   diagnostic flow. Reached via POST /teacher/assign-pace > ReportsController.assignPace.
export const generatePaceProjection = async (teacher_id, student_id, paces) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  if (!sy) throw new Error("No active school year found");

  // Ownership: the student must belong to one of this teacher's grade levels
  const { data: ownedStudent } = await supabaseAdmin
    .from("student")
    .select("student_id, grade_level!inner(teacher_id)")
    .eq("student_id", Number(student_id))
    .eq("grade_level.teacher_id", teacher_id)
    .maybeSingle();
  if (!ownedStudent) throw new Error("Student not found or not assigned to this teacher");

  // 3 PACEs per quarter — matches the monitoring grid, scoring UIs, and grades
  const DEFAULT_PER_QUARTER = 3;
  const rows = [];

  for (const [subject, quarterData] of Object.entries(paces)) {
    if (!subject.trim()) continue;

    if (typeof quarterData === "number" || typeof quarterData === "string") {
      // ── Old format: { subject: lastCompletedPace } ──────────────────
      // Auto-generate 4 equal quarters of DEFAULT_PER_QUARTER each.
      const start = Number(quarterData);
      if (!start || isNaN(start) || start <= 0) continue;
      for (let q = 1; q <= 4; q++) {
        const paceStart = start + (q - 1) * DEFAULT_PER_QUARTER;
        rows.push({
          student_id: Number(student_id),
          sy_id:      sy.sy_id,
          quarter:    q,
          subject,
          pace_start: paceStart,
          pace_end:   paceStart + DEFAULT_PER_QUARTER - 1,
          pace_count: DEFAULT_PER_QUARTER,
          status:     "not-started",
        });
      }
    } else if (typeof quarterData === "object" && quarterData !== null) {
      // ── New format: { subject: { "1": { start, count }, "2": {...}, ... } }
      // Each quarter's start/count comes directly from the frontend (teacher-edited).
      for (let q = 1; q <= 4; q++) {
        const qData = quarterData[String(q)];
        if (!qData) continue;
        const paceStart = Number(qData.start);
        const paceCount = Number(qData.count) || DEFAULT_PER_QUARTER;
        if (!paceStart || isNaN(paceStart) || paceStart <= 0) continue;
        rows.push({
          student_id: Number(student_id),
          sy_id:      sy.sy_id,
          quarter:    q,
          subject,
          pace_start: paceStart,
          pace_end:   paceStart + paceCount - 1,
          pace_count: paceCount,
          status:     "not-started",
        });
      }
    }
  }

  if (!rows.length) throw new Error("No valid PACE numbers provided");

  // ── Locked quarters: a quarter with any recorded official PACE test score
  //    cannot be re-planned (the plan must not drift away from real grades)
  const { data: spRows } = await supabaseAdmin
    .from("student_pace")
    .select("sp_id")
    .eq("student_id", Number(student_id));
  const allSpIds = (spRows ?? []).map((r) => r.sp_id);

  let lockedQuarters = [];
  if (allSpIds.length) {
    const { data: results } = await supabaseAdmin
      .from("pace_test_result")
      .select("quarter")
      .in("sp_id", allSpIds);
    lockedQuarters = [...new Set((results ?? []).map((r) => r.quarter))].sort();
  }
  const lockedSet   = new Set(lockedQuarters);
  const allowedRows = rows.filter((r) => !lockedSet.has(r.quarter));
  const skippedQuarters = [...new Set(rows.filter((r) => lockedSet.has(r.quarter)).map((r) => r.quarter))].sort();

  if (!allowedRows.length) {
    throw new Error(`Cannot update — official PACE test scores already recorded for Q${lockedQuarters.join(", Q")}`);
  }

  // ── Cleanup: student_pace rows for PACE numbers dropped from the plan
  //    (only rows with NO recorded results are removed — scores are sacred).
  //    NOTE: student_pace/pace_module rows are no longer created here; they are
  //    created lazily when a score is first recorded for a projected PACE.
  const subjects = [...new Set(allowedRows.map((r) => r.subject))];
  const { data: oldProj } = await supabaseAdmin
    .from("pace_quarterly_projection")
    .select("subject, quarter, pace_start, pace_count")
    .eq("student_id", Number(student_id))
    .eq("sy_id", sy.sy_id)
    .in("subject", subjects);

  const numbersFor = (rowList, subject, quarterSet) => {
    const nums = new Set();
    rowList.forEach((r) => {
      if (r.subject !== subject || !quarterSet.has(r.quarter) || r.pace_start == null) return;
      for (let i = 0; i < (r.pace_count ?? 0); i++) nums.add(r.pace_start + i);
    });
    return nums;
  };

  const candidateSpIds = [];
  for (const subject of subjects) {
    const quartersBeingSaved = new Set(allowedRows.filter((r) => r.subject === subject).map((r) => r.quarter));
    const oldNums = numbersFor(oldProj ?? [], subject, quartersBeingSaved);
    const newNums = numbersFor(allowedRows, subject, quartersBeingSaved);
    const obsolete = [...oldNums].filter((n) => !newNums.has(n));
    if (!obsolete.length) continue;

    const { data: obsoleteSps } = await supabaseAdmin
      .from("student_pace")
      .select("sp_id, pace_module!inner(subject, module_number)")
      .eq("student_id", Number(student_id))
      .eq("pace_module.subject", subject)
      .in("pace_module.module_number", obsolete);
    (obsoleteSps ?? []).forEach((sp) => candidateSpIds.push(sp.sp_id));
  }

  if (candidateSpIds.length) {
    const scored = new Set();
    const [{ data: pt }, { data: st }, { data: cu }] = await Promise.all([
      supabaseAdmin.from("pace_test_result").select("sp_id").in("sp_id", candidateSpIds),
      supabaseAdmin.from("self_test_result").select("sp_id").in("sp_id", candidateSpIds),
      supabaseAdmin.from("check_up_result").select("sp_id").in("sp_id", candidateSpIds),
    ]);
    [...(pt ?? []), ...(st ?? []), ...(cu ?? [])].forEach((r) => scored.add(r.sp_id));

    const toDelete = candidateSpIds.filter((id) => !scored.has(id));
    if (toDelete.length) {
      await supabaseAdmin.from("student_pace").delete().in("sp_id", toDelete);
    }
  }

  const { error } = await ReportsModel.upsertPaceQuarterlyProjection(allowedRows);
  if (error) throw new Error(error.message);
  return {
    generated:       allowedRows.length,
    skippedQuarters,
    student_id,
    school_year:     sy.year_label,
  };
};

// ── Generate projection from diagnostic placement (principal) ─────────────────
// Used by the Diagnostic flow's "Save Projection" step (no teacher-ownership check).
// paces accepts either:
//   { [subject]: startPace }                          → auto 4 quarters of 3, consecutive
//   { [subject]: { "1": {start,count}, "2": {...} } } → explicit per-quarter starts (edited grid)
export const generateDiagnosticProjection = async (student_id, paces = {}) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  if (!sy) throw new Error("No active school year found");

  const PER_QUARTER = 3;
  const makeRow = (q, subject, start, count) => ({
    student_id: Number(student_id),
    sy_id:      sy.sy_id,
    quarter:    q,
    subject,
    pace_start: start,
    pace_end:   start + count - 1,
    pace_count: count,
    status:     "not-started",
  });

  const rows = [];
  for (const [subject, val] of Object.entries(paces)) {
    if (!subject.trim()) continue;
    if (typeof val === "number" || typeof val === "string") {
      const start = Number(val);
      if (!start || isNaN(start) || start <= 0) continue;
      for (let q = 1; q <= 4; q++) rows.push(makeRow(q, subject, start + (q - 1) * PER_QUARTER, PER_QUARTER));
    } else if (val && typeof val === "object") {
      for (let q = 1; q <= 4; q++) {
        const qd = val[String(q)];
        if (!qd) continue;
        const start = Number(qd.start);
        const count = Number(qd.count) || PER_QUARTER;
        if (!start || isNaN(start) || start <= 0) continue;
        rows.push(makeRow(q, subject, start, count));
      }
    }
  }
  if (!rows.length) throw new Error("No valid starting PACEs provided");

  const { error } = await ReportsModel.upsertPaceQuarterlyProjection(rows);
  if (error) throw new Error(error.message);
  return { generated: rows.length, student_id: Number(student_id), school_year: sy.year_label };
};

export const getTeacherAllStatuses = async (teacher_id) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  if (!sy) return {};

  const { data, error } = await ReportsModel.findReportSubmissionsForTeacher(teacher_id, sy.sy_id);
  if (error) throw new Error(error.message);
  const map = {};
  (data ?? []).forEach((row) => {
    map[`${row.report_type}-${row.quarter}`] = row.submitted_at;
  });
  return map;
};

// Submitted/published reports for the "Submitted Reports" table (Reports page).
export const getSubmittedReports = async (teacher_id) => {
  const { data: sy } = await ReportsModel.findActiveSchoolYear();
  const schoolYear = sy?.year_label ?? "—";

  // Class = the supervisor's grade level(s)
  const { data: gls } = await supabaseAdmin
    .from("grade_level").select("level_name").eq("teacher_id", teacher_id);
  const className = (gls ?? []).map((g) => g.level_name).join(", ") || "All Students";

  const statuses = await getTeacherAllStatuses(teacher_id);
  const TYPE_LABEL = {
    academic: "Class Academic Record",
    attendance: "Attendance Report",
    pace: "PACE Progress Report",
    analytics: "PACE Analytics & Rankings Report",
  };

  const rows = Object.keys(statuses).map((key) => {
    const [report_type, q] = key.split("-");
    return {
      report_type,
      typeLabel:   TYPE_LABEL[report_type] ?? report_type,
      quarter:     Number(q),
      quarterLabel: `${["1st", "2nd", "3rd", "4th"][Number(q) - 1]} Quarter`,
      studentClass: `${className} - All Students`,
      schoolYear,
      status:      "Published",
      publishedOn: statuses[key],
    };
  }).sort((a, b) => a.report_type.localeCompare(b.report_type) || a.quarter - b.quarter);

  return { rows, schoolYear, className };
};

// ── PACE Progress Report ──────────────────────────────────────────────────────

export const getTeacherPaceReport = async (teacher_id, quarter = 1, sy_id = null) => {
  const sy = await getSchoolYear(sy_id);
  const syLabel = sy?.year_label ?? `${currentYear - 1}–${currentYear}`;
  const qLabel  = QUARTER_LABELS[quarter - 1] ?? `Quarter ${quarter}`;

  const { gradeLevels } = await getStudentsForTeacher(teacher_id, sy.sy_id);
  const { data: projections, error } = await ReportsModel.findPaceProjectionForTeacher(
    teacher_id,
    quarter,
    sy.sy_id,
  );
  if (error) throw new Error(error.message);

  const paces = projections ?? [];
  const subjectOrder = [];
  const subjectSet = new Set();
  paces.forEach((pace) => {
    if (pace.subject && !subjectSet.has(pace.subject)) {
      subjectSet.add(pace.subject);
      subjectOrder.push(pace.subject);
    }
  });

  const studentsById = new Map();
  paces.forEach((pace) => {
    if (!studentsById.has(pace.student_id)) {
      studentsById.set(pace.student_id, {
        name: pace.student
          ? `${pace.student.last_name}, ${pace.student.first_name}`
          : `Student ${pace.student_id}`,
        projections: new Map(),
      });
    }
    studentsById.get(pace.student_id).projections.set(pace.subject, pace);
  });

  const rows = [...studentsById.values()].map((student) => {
    const subjects = subjectOrder.map((subj) => {
      const projection = student.projections.get(subj);
      if (!projection) return { subject: subj, range: "—", count: 0, status: "not-started" };
      return {
        subject: subj,
        range: paceRange(projection),
        count: projection.pace_count ?? 0,
        status: deriveSubjectStatus(projection),
      };
    });
    return {
      name: student.name,
      subjects,
      total: subjects.reduce((sum, subject) => sum + subject.count, 0),
    };
  });

  return {
    quarterLabel: qLabel,
    schoolYear:   syLabel,
    gradeLevels,
    subjects:     subjectOrder,
    students:     rows,
  };
};
