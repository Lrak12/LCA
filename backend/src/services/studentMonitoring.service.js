// ============================================================================
// FEATURE MAP - Student Monitoring   (BACKEND · LAYER 3 of 4: SERVICE)
// ----------------------------------------------------------------------------
// This is the backend for the Student Monitoring feature - the BUSINESS-LOGIC
// layer. This is where the real work happens: it asks the MODEL for raw rows
// from the database, then computes everything the UI shows (PACE counts,
// completion %, status, recommendations, rankings, the per-subject grade grid).
//   Comes from:  studentMonitoring.controller.js
//   Gets data via > studentMonitoring.model.js  (raw Supabase queries)
//   Returns to >   the controller, which sends it as JSON to the frontend
// The four exported functions below (getStudentMonitoring / getPaceAnalytics /
// getStudentSummary / getStudentProfile) are the entry points the controller calls.
// ============================================================================
import * as StudentMonitoringModel from "../models/studentMonitoring.model.js";
import { findActive as findActiveSchoolYear } from "../models/schoolYear.model.js";
import { getCurrentQuarter } from "./settings.service.js";

const sectionFallbacks = ["Wisdom", "Faith", "Grace"];

const toPaceCode = (pace) => {
  const subject = pace.pace_module?.subject || pace.pace_module?.module_name || "PACE";
  const number = pace.pace_module?.module_number;
  return number ? `${subject} ${number}` : subject;
};

const getPaceCounts = (paces) => {
  const completed = paces.filter((pace) => pace.status === "Completed").length;
  const inProgress = paces.filter((pace) => pace.status === "In Progress").length;
  const assigned = paces.filter((pace) => pace.status === "Assigned").length;
  const total = paces.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return { completed, inProgress, assigned, total, progress };
};

const getStudentStatus = ({ progress, total, assigned }) => {
  if (total === 0 || progress < 50 || assigned >= 6) return "Stalled";
  if (progress >= 85) return "Ahead";
  return "On Track";
};

const PACE_PASS_MARK = 90; // a PACE is "passed" at a test score >= 90

const parseGaps = (str) =>
  (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Build the PACE recommendation for a student. Goal: tell the principal where to
 * PLACE a student (diagnostic-driven) or whether to ADVANCE them (progress-driven),
 * and flag who needs intervention. Returns null when there's nothing to act on.
 *
 * Decision order:
 *  1. PLACEMENT — a diagnostic recorded specific learning_gaps → recommend filling
 *     exactly those PACEs (targeted remediation). Needs Support.
 *  2. PLACEMENT — a diagnostic gave a start_pace but the student isn't placed yet
 *     (no PACEs) → recommend placing them at start_pace. Needs Support.
 *  3. ADVANCE — active student whose CURRENT PACE was passed (score >= 90) →
 *     recommend the next PACE. On Track.
 *  4. REMEDIATE — current PACE attempted but failed (score < 90) → recommend
 *     retaking the current PACE. Needs Support.
 *  5. CONTINUE — current PACE still in progress (no score yet) → stay on it;
 *     flagged Needs Support only if stalled/backlogged.
 *
 * Returns { mode, currentPaceLabel, projectedPaceLabel, basis, status }.
 */
const buildRecommendation = (gradeLabel, studentPaces, diags, counts, scoresBySpId) => {
  const hasDiagnostic = diags.length > 0;
  const hasProgress   = counts.total > 0;
  if (!hasDiagnostic && !hasProgress) return null;

  // Current PACE = the highest-numbered active PACE (fallback: highest overall)
  const numbered    = studentPaces.filter((p) => typeof p.pace_module?.module_number === "number");
  const activePaces = numbered.filter((p) => p.status !== "Completed");
  const pickCurrent = (list) =>
    list.reduce((max, p) => (!max || p.pace_module.module_number > max.pace_module.module_number ? p : max), null);
  const currentSp        = pickCurrent(activePaces.length ? activePaces : numbered);
  const currentPaceNumber = currentSp?.pace_module?.module_number ?? null;
  const currentScore      = currentSp ? scoresBySpId.get(currentSp.sp_id) ?? null : null;

  const currentPaceLabel = currentPaceNumber != null ? `${gradeLabel} - PACE ${currentPaceNumber}` : gradeLabel;
  const withGrade = (paceText) => `${gradeLabel} - PACE ${paceText}`;
  const basisFor  = (b) => (hasProgress && hasDiagnostic && b === "Assessment Result" ? "Assessment Result & Progress" : b);

  // 1. PLACEMENT via learning gaps — recommend the exact missing PACEs
  const diagWithGaps = diags.find((d) => parseGaps(d.learning_gaps).length > 0);
  if (diagWithGaps) {
    const gaps = parseGaps(diagWithGaps.learning_gaps);
    return {
      mode: "placement",
      currentPaceLabel,
      projectedPaceLabel: withGrade(gaps.join(", ")),
      basis: basisFor("Assessment Result"),
      status: "Needs Support",
    };
  }

  // 2. PLACEMENT via start_pace — student not yet placed
  const diagWithPace = diags.find((d) => d.start_pace != null);
  if (diagWithPace && !hasProgress) {
    return {
      mode: "placement",
      currentPaceLabel,
      projectedPaceLabel: withGrade(diagWithPace.start_pace),
      basis: "Assessment Result",
      status: "Needs Support",
    };
  }

  // 3–5. ADVANCEMENT / REMEDIATION / CONTINUE — driven by the current PACE result
  if (currentPaceNumber != null) {
    if (currentScore != null && currentScore >= PACE_PASS_MARK) {
      return {
        mode: "advance",
        currentPaceLabel,
        projectedPaceLabel: withGrade(currentPaceNumber + 1),
        basis: basisFor("Progress Performance"),
        status: "On Track",
      };
    }
    if (currentScore != null && currentScore < PACE_PASS_MARK) {
      return {
        mode: "remediate",
        currentPaceLabel,
        projectedPaceLabel: `Retake ${withGrade(currentPaceNumber)}`,
        basis: basisFor("Progress Performance"),
        status: "Needs Support",
      };
    }
    // In progress, no recorded score yet — continue current PACE
    const stalled = counts.progress < 60 || counts.assigned >= 6;
    return {
      mode: "continue",
      currentPaceLabel,
      projectedPaceLabel: `Continue ${withGrade(currentPaceNumber)}`,
      basis: basisFor("Progress Performance"),
      status: stalled ? "Needs Support" : "On Track",
    };
  }

  // Diagnostic exists but no usable PACE info
  if (diagWithPace) {
    return {
      mode: "placement",
      currentPaceLabel,
      projectedPaceLabel: withGrade(diagWithPace.start_pace),
      basis: "Assessment Result",
      status: "Needs Support",
    };
  }
  return null;
};

const getGradeLabel = (student, paces, gradeByStudent) => {
  if (student.grade_level) return student.grade_level;
  if (student.grade) return `Grade ${student.grade}`;
  if (student.gl_id && student.level_name) return student.level_name;
  if (gradeByStudent.has(student.student_id)) return gradeByStudent.get(student.student_id);

  const paceGrade = paces.find((pace) => pace.pace_module?.grade_level?.level_name)
    ?.pace_module?.grade_level?.level_name;
  return paceGrade || "Grade Unassigned";
};

const getSectionLabel = (student) => {
  if (student.section) return student.section;
  if (student.section_name) return student.section_name;
  return sectionFallbacks[Number(student.student_id) % sectionFallbacks.length];
};

// ── FEATURE ENTRY POINT ───────────────────────────────────────────────────────
// getStudentMonitoring - powers the Student Records / Progress / Recommendations
// tabs. WHAT IT DOES: pulls every student, their student_pace rows, diagnostics
// and latest PACE-test scores from the MODEL, then builds a per-student row
// (counts, status, recommendation) plus overall stats.
// WHERE IT GOES NEXT: returned to controller.getOverview > JSON > the frontend
// page pages/principal/StudentMonitoring.jsx.
export const getStudentMonitoring = async () => {
  const [
    { data: students, error: studentsError },
    { data: paces, error: pacesError },
    { data: diagnostics, error: diagnosticsError },
  ] = await Promise.all([
    StudentMonitoringModel.findStudents(),
    StudentMonitoringModel.findStudentPaces(),
    StudentMonitoringModel.findDiagnosticAssessments(),
  ]);

  if (studentsError) throw new Error(studentsError.message);
  if (pacesError) throw new Error(pacesError.message);
  if (diagnosticsError) throw new Error(diagnosticsError.message);

  const pacesByStudent = new Map();
  (paces || []).forEach((pace) => {
    const list = pacesByStudent.get(pace.student_id) || [];
    list.push(pace);
    pacesByStudent.set(pace.student_id, list);
  });

  // Diagnostic assessments per student (already newest-first from the query)
  const diagsByStudent = new Map();
  (diagnostics || []).forEach((d) => {
    const list = diagsByStudent.get(d.student_id) || [];
    list.push(d);
    diagsByStudent.set(d.student_id, list);
  });

  // Latest PACE test score per student_pace (needed to decide "passed → advance")
  const scoresBySpId = new Map();
  const allSpIds = (paces || []).map((p) => p.sp_id).filter(Boolean);
  if (allSpIds.length) {
    const { data: results } = await StudentMonitoringModel.findPaceTestResultsBySpIds(allSpIds);
    // results are ordered date DESC → first seen per sp_id is the latest
    (results || []).forEach((r) => {
      if (!scoresBySpId.has(r.sp_id)) scoresBySpId.set(r.sp_id, r.score);
    });
  }

  const gradeByStudent = new Map();

  const rows = (students || []).map((student) => {
    const studentPaces = pacesByStudent.get(student.student_id) || [];
    const counts = getPaceCounts(studentPaces);
    const status = getStudentStatus(counts);
    const gradeLabel = student.grade_level?.level_name ?? "Grade Unassigned";
    const recommendation = buildRecommendation(
      gradeLabel,
      studentPaces,
      diagsByStudent.get(student.student_id) || [],
      counts,
      scoresBySpId
    );
    const activePaces = studentPaces
      .filter((pace) => pace.status !== "Completed")
      .slice(0, 3)
      .map((pace) => ({
        id: pace.sp_id,
        code: toPaceCode(pace),
        status: pace.status,
      }));

    return {
      student_id:     student.student_id,
      first_name:     student.first_name,
      last_name:      student.last_name,
      full_name:      `${student.first_name} ${student.last_name}`,
      date_of_birth:  student.date_of_birth  ?? null,
      gender:         student.gender          ?? null,
      address:        student.address         ?? null,
      contact_number: student.contact_number  ?? null,
      grade_level:    student.grade_level?.level_name ?? "Grade Unassigned",
      section:        getSectionLabel(student),
      activePaces,
      completedPaces:  counts.completed,
      inProgressPaces: counts.inProgress,
      assignedPaces:   counts.assigned,
      totalPaces:      counts.total,
      remainingPaces:  Math.max(counts.total - counts.completed, 0),
      progress:        counts.progress,
      status,
      recommendation,
    };
  });

  const totalPaces = rows.reduce((sum, row) => sum + row.totalPaces, 0);
  const completedPaces = rows.reduce((sum, row) => sum + row.completedPaces, 0);
  const averageProgress = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length)
    : 0;
  const stalledStudents = rows.filter((row) => row.status === "Stalled").length;

  return {
    stats: {
      totalStudents: rows.length,
      pacesCompleted: completedPaces,
      totalPaces,
      averageProgress,
      stalledStudents,
    },
    students: rows,
  };
};

// ── PACE Analytics & Rankings ─────────────────────────────────────────────────
// Ranks students by total performance points earned on PACEs finished in the
// current quarter. Points come from student_pace.points_earned (set at completion):
//   10  On-Time completion (passed)
//    7  Extended completion (passed)
//    5  Late completion (passed)
//    0  not passed / incomplete

const atMidnight = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Performance points for a finished PACE come from the stored student_pace.points_earned
// (10 On-Time / 7 Extended / 5 Late-passed / 0 not-passed), computed at completion time
// by the Assign/Manage Student PACE flow. This is the single scheme used everywhere.
function scoreFinishedPace(pace) {
  return pace.points_earned ?? 0;
}

// ── FEATURE ENTRY POINT ───────────────────────────────────────────────────────
// getPaceAnalytics - powers the "PACE Analytics & Rankings" tab. WHAT IT DOES:
// finds the active quarter, sums each student's performance points on PACEs
// finished this quarter, ranks them, builds the Top-10 completion list and the
// month-over-month completion trend. WHERE IT GOES NEXT: returned to
// controller.getPaceAnalytics > JSON > PaceAnalyticsTab in the frontend page.
export const getPaceAnalytics = async () => {
  const { data: sy } = await findActiveSchoolYear();
  if (!sy?.start_date) {
    return {
      quarter: null, quarterLabel: "—",
      stats: { topPerformer: null, pacesFinished: 0, avgPoints: 0 },
      rankings: [], topCompletion: [],
      trend: { weeks: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"], thisMonth: [], lastMonth: [] },
    };
  }

  // Active quarter comes from the principal's academic configuration (Settings),
  // so analytics always tracks the same quarter the school considers current.
  const aq = getCurrentQuarter(sy);
  const quarter      = aq.quarter;
  const quarterLabel = aq.label;
  const start = atMidnight(aq.start);
  const end   = atMidnight(aq.end);

  const [{ data: students }, { data: paces }] = await Promise.all([
    StudentMonitoringModel.findStudents(),
    StudentMonitoringModel.findStudentPaces(),
  ]);

  const studentById = new Map((students || []).map((s) => [s.student_id, s]));

  // Aggregate points per student over PACEs FINISHED in the current quarter
  const agg = new Map(); // student_id → { points, finished, onTime, extended, late }
  (paces || []).forEach((p) => {
    if (!p.completion_date) return;                       // not finished
    const c = atMidnight(p.completion_date);
    if (c == null || c < start || c > end) return;        // finished outside this quarter
    const pts = scoreFinishedPace(p);

    const a = agg.get(p.student_id) || { points: 0, finished: 0, onTime: 0, extended: 0, late: 0 };
    a.points += pts;
    a.finished += 1;
    if (p.completion_status === "On Time") a.onTime += 1;
    else if (p.completion_status === "Extended") a.extended += 1;
    else a.late += 1;
    agg.set(p.student_id, a);
  });

  const rankings = [...agg.entries()]
    .map(([student_id, a]) => {
      const s = studentById.get(student_id);
      return {
        student_id,
        full_name:   s ? `${s.first_name} ${s.last_name}` : `Student ${student_id}`,
        grade_level: s?.grade_level?.level_name ?? "Grade Unassigned",
        ...a,
      };
    })
    .sort((x, y) => y.points - x.points || y.onTime - x.onTime || x.full_name.localeCompare(y.full_name))
    .map((row, i) => ({ rank: i + 1, ...row }));

  const totalFinished = rankings.reduce((sum, r) => sum + r.finished, 0);
  const totalPoints   = rankings.reduce((sum, r) => sum + r.points, 0);

  // ── Top 10 by PACE completion ────────────────────────────────────────────────
  // PLACEMENT is by speed points (how fast the student finishes assigned PACEs):
  //   +5 finished in the first half of the assigned window, +3 in the second half
  //   (still on time), 0 late — summed per student via scoreFinishedPace().
  // The DISPLAYED percentage is how many of the student's PACEs are completed
  //   (completed / total). A PACE belongs to the quarter when its start_date falls
  //   in the quarter window (same date basis as the points rankings above).
  const perStudent = new Map(); // student_id → { completed, total, points, onTime, extended, late }
  (paces || []).forEach((p) => {
    const startTs = atMidnight(p.start_date);
    if (startTs == null || startTs < start || startTs > end) return; // not this quarter's PACE
    const t = perStudent.get(p.student_id) || { completed: 0, total: 0, points: 0, onTime: 0, extended: 0, late: 0 };
    t.total += 1;
    if (p.status === "Completed") {
      t.completed += 1;
      t.points += scoreFinishedPace(p);
      if (p.completion_status === "On Time") t.onTime += 1;
      else if (p.completion_status === "Extended") t.extended += 1;
      else t.late += 1;
    }
    perStudent.set(p.student_id, t);
  });

  const topCompletion = [...perStudent.entries()]
    .map(([student_id, t]) => {
      const s = studentById.get(student_id);
      return {
        student_id,
        full_name:   s ? `${s.first_name} ${s.last_name}` : `Student ${student_id}`,
        grade_level: s?.grade_level?.level_name ?? "Grade Unassigned",
        completed:   t.completed,
        total:       t.total,
        completionPct: t.total ? Math.round((t.completed / t.total) * 1000) / 10 : 0,
        points:      t.points,
        onTime:      t.onTime,
        extended:    t.extended,
        late:        t.late,
      };
    })
    // Placement by speed points; completion % then name break ties.
    .sort((a, b) =>
      b.points - a.points ||
      b.completionPct - a.completionPct ||
      a.full_name.localeCompare(b.full_name))
    .slice(0, 10);

  // ── Completion performance trend (this month vs last month) ───────────────────
  // For each month, the running % of all PACEs completed (100%) by week-of-month.
  const totalPaces = (paces || []).length;
  const weekOf = (d) => Math.min(5, Math.max(1, Math.ceil(d.getDate() / 7))); // 1..5
  const monthlyCompletionCurve = (year, month) => {
    const weekly = [0, 0, 0, 0, 0];
    (paces || []).forEach((p) => {
      if (p.status !== "Completed" || !p.completion_date) return;
      const c = new Date(p.completion_date);
      if (c.getFullYear() === year && c.getMonth() === month) weekly[weekOf(c) - 1] += 1;
    });
    // cumulative count → cumulative percentage of all PACEs
    const curve = [];
    let running = 0;
    for (const n of weekly) {
      running += n;
      curve.push(totalPaces ? Math.round((running / totalPaces) * 1000) / 10 : 0);
    }
    return curve;
  };

  const now       = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const trend = {
    weeks:     ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"],
    thisMonth: monthlyCompletionCurve(now.getFullYear(), now.getMonth()),
    lastMonth: monthlyCompletionCurve(lastMonth.getFullYear(), lastMonth.getMonth()),
  };

  return {
    quarter,
    quarterLabel,
    stats: {
      topPerformer:  rankings[0] ? { name: rankings[0].full_name, points: rankings[0].points } : null,
      pacesFinished: totalFinished,
      avgPoints:     rankings.length ? Math.round((totalPoints / rankings.length) * 10) / 10 : 0,
    },
    rankings,
    topCompletion,
    trend,
  };
};

// ── Student Summary (principal "View Student" modal) ──────────────────────────
// Compact view: identity + PACE progress + projected recommendation + ranking.
// Reuses buildRecommendation and getPaceAnalytics so it stays consistent with the
// Recommendations and PACE Analytics tabs.
// ── FEATURE ENTRY POINT ───────────────────────────────────────────────────────
// getStudentSummary - powers the "View Student Details" modal. WHAT IT DOES:
// for ONE student, gathers identity + parent, PACE progress (completed / on-time /
// late / not-passed / completion rate), the projected PACE plan, the current-
// quarter ranking, and the recommendation. WHERE IT GOES NEXT: returned to
// controller.getStudentSummary > JSON > components/StudentSummaryModal.jsx.
export const getStudentSummary = async (student_id) => {
  const id = Number(student_id);
  const { data: activeSY } = await findActiveSchoolYear();
  const [
    { data: student },
    { data: studentPaces = [] },
    { data: allDiags = [] },
    { data: parentContacts = [] },
    { data: projections = [] },
    analytics,
  ] = await Promise.all([
    StudentMonitoringModel.findStudentProfileById(id),
    StudentMonitoringModel.findStudentPacesByStudentId(id),
    StudentMonitoringModel.findDiagnosticAssessments(),
    StudentMonitoringModel.findParentContactsByStudentId(id),
    activeSY?.sy_id
      ? StudentMonitoringModel.findPaceProjectionsByStudent(id, activeSY.sy_id)
      : Promise.resolve({ data: [] }),
    getPaceAnalytics(),
  ]);
  if (!student) throw new Error(`Student with ID ${id} not found`);

  // Latest PACE test score per student_pace
  const scoresBySpId = new Map();
  const spIds = studentPaces.map((p) => p.sp_id).filter(Boolean);
  if (spIds.length) {
    const { data: results = [] } = await StudentMonitoringModel.findPaceTestResultsBySpIds(spIds);
    (results || []).forEach((r) => { if (!scoresBySpId.has(r.sp_id)) scoresBySpId.set(r.sp_id, r.score); });
  }

  const counts     = getPaceCounts(studentPaces);
  const gradeLabel = student.grade_level?.level_name ?? "Grade Unassigned";
  const diags      = (allDiags || []).filter((d) => d.student_id === id);
  const recommendation = buildRecommendation(gradeLabel, studentPaces, diags, counts, scoresBySpId);

  // Ranking from the current-quarter PACE analytics
  const rankings = analytics.rankings ?? [];
  const myEntry  = rankings.find((r) => r.student_id === id) ?? null;
  let gradeLevelRank = null;
  if (myEntry) {
    const sameGrade = rankings.filter((r) => r.grade_level === myEntry.grade_level);
    const pos = sameGrade.findIndex((r) => r.student_id === id) + 1;
    gradeLevelRank = pos === 1 ? "Top Performer" : `#${pos} in ${myEntry.grade_level}`;
  }

  const paceStatus = counts.total > 0
    ? (counts.completed >= counts.total ? "Completed" : "In Progress")
    : "Not Started";
  const completionRate = counts.total
    ? Math.round((counts.completed / counts.total) * 10000) / 100
    : 0;

  // Completed-PACE timing breakdown by completion_status.
  let completedOnTime = 0, completedLate = 0;
  studentPaces.forEach((p) => {
    if (p.status !== "Completed") return;
    if (p.completion_status === "Late") completedLate += 1;
    else                                completedOnTime += 1; // On Time / Extended
  });
  // PACEs whose latest recorded test score is below the pass mark
  let testNotPassed = 0;
  scoresBySpId.forEach((score) => { if (score != null && score < PACE_PASS_MARK) testNotPassed += 1; });
  const readiness = studentPaces.some((p) => p.ready_for_next === true) ? "Yes" : "No";

  // Projected PACE plan per subject — range across the quarterly projection.
  const bySubject = new Map(); // subject → { min, max }
  (projections || []).forEach((row) => {
    if (row.pace_start == null) return;
    const start = row.pace_start;
    const end   = row.pace_start + Math.max((row.pace_count ?? 1) - 1, 0);
    const cur   = bySubject.get(row.subject) ?? { min: start, max: end };
    bySubject.set(row.subject, { min: Math.min(cur.min, start), max: Math.max(cur.max, end) });
  });
  const projectedPlan = [...bySubject.entries()].map(([subject, r]) => ({
    subject,
    range: r.min === r.max ? `${r.min}` : `${r.min} – ${r.max}`,
  }));

  const primaryParent = (parentContacts || [])[0] ?? null;

  return {
    student: {
      student_id:      student.student_id,
      full_name:       `${student.first_name} ${student.last_name}`,
      grade_level:     gradeLabel,
      gender:          student.gender ?? null,
      contact_number:  student.contact_number ?? null,
      enrollment_date: student.enrollment_date ?? null,
      address:         student.address ?? null,
      parent_name:     primaryParent?.parent_name ?? null,
      parent_relationship: primaryParent?.relationship_to_student ?? null,
    },
    paceSummary: {
      assigned:        counts.total,
      completed:       counts.completed,
      completionRate,
      paceStatus,
      pointsEarned:    myEntry?.points ?? 0,
      completedOnTime,
      completedLate,
      testNotPassed,
      readiness,
    },
    projectedPlan,
    recommendation: recommendation
      ? { recommendedLevel: recommendation.projectedPaceLabel, basis: recommendation.basis }
      : null,
    ranking: {
      currentRank:    myEntry?.rank ?? null,
      gradeLevelRank,
    },
  };
};

// ── Student Profile ───────────────────────────────────────────────────────────

const QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Build a Map<sp_id, latestScore> keeping the most-recent recorded score per PACE.
 * Results arrive sorted date DESC, so the first score seen per sp_id is the latest.
 *
 * Scores are keyed by sp_id ALONE, never by quarter. `recordPaceTest` leaves
 * pace_test_result.quarter null, and a student_pace already maps to exactly one
 * PACE (and therefore one quarter), so the quarter column is redundant here;
 * matching on it would hide the real score behind a null-quarter mismatch.
 */
function buildLatestScoreMap(paceTestResults) {
  const map = new Map(); // key = sp_id, value = its latest score
  for (const r of paceTestResults) {
    if (typeof r.score === "number" && !map.has(r.sp_id)) map.set(r.sp_id, r.score);
  }
  return map;
}

/**
 * Build the per-subject grid the modal expects, driven by the student's
 * pace_quarterly_projection: each QUARTER has its own 3 PACEs, so the rows are
 * { label, paces: [n1,n2,n3], scores: [s1,s2,s3] } where each score is a
 * number (recorded test for that quarter), "ongoing", or "not_started".
 */
function buildSubjectPaces(projRows, studentPaces, scoreBySpId) {
  // subject::module_number → student_pace (for sp_id score lookup)
  const spByKey = new Map();
  for (const sp of studentPaces) {
    const subject      = sp.pace_module?.subject;
    const moduleNumber = sp.pace_module?.module_number;
    if (!subject || moduleNumber == null) continue;
    spByKey.set(`${subject}::${moduleNumber}`, sp);
  }

  // subject → quarter → projection row
  const bySubject = {};
  for (const row of projRows) {
    if (!bySubject[row.subject]) bySubject[row.subject] = {};
    bySubject[row.subject][row.quarter] = row;
  }

  const result = {};
  for (const [subject, qRows] of Object.entries(bySubject)) {
    result[subject] = {
      quarters: QUARTER_LABELS.map((label, i) => {
        const q   = i + 1;
        const row = qRows[q] ?? null;
        const rowStatuses = row ? [row.status_r0, row.status_r1, row.status_r2] : [];

        const paces  = [];
        const scores = [];
        for (let j = 0; j < 3; j++) {
          const paceNo = row?.pace_start != null ? row.pace_start + j : null;
          paces.push(paceNo);
          if (paceNo == null) { scores.push("not_started"); continue; }

          const sp    = spByKey.get(`${subject}::${paceNo}`);
          const score = sp ? scoreBySpId.get(sp.sp_id) : undefined;
          if (typeof score === "number") {
            scores.push(score);
          } else {
            const st = rowStatuses[j];
            scores.push(
              st === "in-progress" || st === "taken-home" || st === "completed"
                ? "ongoing"
                : "not_started"
            );
          }
        }
        return { label, paces, scores };
      }),
    };
  }
  return result;
}

// ── FEATURE ENTRY POINT ───────────────────────────────────────────────────────
// getStudentProfile - powers the "View Full Plan" modal (per-subject PACE grid).
// WHAT IT DOES: for ONE student, builds the full academic record: PACE status
// counts, average score, the subject × quarter grade grid (driven by the
// quarterly projection + latest test scores), attendance, PACEs brought home and
// 100s achieved. WHERE IT GOES NEXT: returned to controller.getStudentProfile >
// JSON > components/StudentProfileModal.jsx.
export const getStudentProfile = async (student_id) => {
  // 1. Active school year (maybeSingle — no crash if none is set)
  const { data: schoolYear } = await findActiveSchoolYear();
  // Use fallback dates if no active school year is configured
  const syStart = schoolYear?.start_date ?? "1900-01-01";
  const syEnd   = schoolYear?.end_date   ?? "2100-12-31";

  // 2. Student profile
  const { data: student, error: studentError } =
    await StudentMonitoringModel.findStudentProfileById(student_id);
  if (studentError) throw new Error(studentError.message);
  if (!student)     throw new Error(`Student with ID ${student_id} not found`);

  // 3. Student paces
  const { data: studentPaces = [], error: pacesError } =
    await StudentMonitoringModel.findStudentPacesByStudentId(student_id);
  if (pacesError) throw new Error(pacesError.message);

  const spIds = studentPaces.map((sp) => sp.sp_id);

  // 4. Pace test results (only if there are paces)
  let paceTestResults = [];
  if (spIds.length > 0) {
    const { data, error } =
      await StudentMonitoringModel.findPaceTestResultsBySpIds(spIds);
    if (error) throw new Error(error.message);
    paceTestResults = data ?? [];
  }

  // 5. Attendance for active school year
  const { data: attendanceRows = [], error: attError } =
    await StudentMonitoringModel.findAttendanceByStudentAndYear(
      student_id,
      syStart,
      syEnd
    );
  if (attError) throw new Error(attError.message);

  // ── Derived data ───────────────────────────────────────────────────────────

  // PACE status counts
  const completed  = studentPaces.filter((sp) => sp.status === "Completed").length;
  const ongoing    = studentPaces.filter((sp) => sp.status === "In Progress").length;
  const assigned   = studentPaces.filter((sp) => sp.status === "Assigned").length;
  const total      = studentPaces.length;
  const remaining  = Math.max(total - completed, 0);
  const readyForNext = studentPaces.some((sp) => sp.ready_for_next === true);

  // Latest recorded score per PACE (keyed by sp_id, quarter-agnostic)
  const scoreBySpId = buildLatestScoreMap(paceTestResults);

  // Average score across all latest results
  const allScores = [...scoreBySpId.values()];
  const averageScore = allScores.length
    ? round2(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;

  // Subject paces matrix — driven by the quarterly projection (plan of record)
  const { data: projRows = [] } = await StudentMonitoringModel.findPaceProjectionsByStudent(
    student_id,
    schoolYear?.sy_id ?? 0
  );
  const subjectPaces = buildSubjectPaces(projRows ?? [], studentPaces, scoreBySpId);

  // Attendance counts
  const attendance = { present: 0, absent: 0, tardy: 0 };
  for (const row of attendanceRows) {
    const s = (row.status || "").toLowerCase();
    if (s === "present")               attendance.present++;
    else if (s === "absent")           attendance.absent++;
    else if (s === "tardy" || s === "late") attendance.tardy++;
  }

  // PACEs brought home (homework = true), most-recent first
  const pacesBroughtHome = studentPaces
    .filter((sp) => sp.homework === true)
    .map((sp) => ({
      pace_code: `${sp.pace_module?.subject ?? "PACE"} ${sp.pace_module?.module_number ?? ""}`.trim(),
      date: sp.end_date ?? sp.assigned_date ?? null,
    }))
    .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));

  // 100s achieved — latest results first
  const hundredsAchieved = paceTestResults
    .filter((r) => r.score === 100)
    .reduce((acc, r) => {
      // Keep only the latest per sp_id (results already sorted date DESC)
      if (!acc.seen.has(r.sp_id)) {
        acc.seen.add(r.sp_id);
        const sp      = studentPaces.find((s) => s.sp_id === r.sp_id);
        const subject = sp?.pace_module?.subject ?? "PACE";
        const modNo   = sp?.pace_module?.module_number ?? "";
        acc.list.push({
          pace_code: `${subject} ${modNo}`.trim(),
          date:      r.date_taken,
        });
      }
      return acc;
    }, { seen: new Set(), list: [] })
    .list;

  return {
    student: {
      student_id:    student.student_id,
      first_name:    student.first_name,
      last_name:     student.last_name,
      date_of_birth: student.date_of_birth,
      gender:        student.gender,
      address:       student.address,
      contact_number: student.contact_number,
      grade_level:   student.grade_level?.level_name ?? null,
    },
    paceStats: {
      completed,
      ongoing,
      assigned,
      total,
      remaining,
      averageScore,
      readyForNext,
    },
    subjectPaces,
    attendance,
    pacesBroughtHome,
    hundredsAchieved,
  };
};

