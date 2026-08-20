import { supabaseAdmin } from "../config/supabase.js";
import { validateSchoolYear } from "../helpers/schoolYearValidation.js";
import { activateSchoolYear, createSchoolYear } from "./schoolYear.service.js";

// One school year = 12 PACEs per subject (4 quarters × 3). A student has
// "finished the grade" when they have completed (passed) the year's projected
// PACEs in the CORE subjects below.
const CORE_SUBJECTS = ["English", "Mathematics", "Science", "Filipino"];
const PER_QUARTER   = 3;

// Build: student_id → subject → highest completed PACE number.
// "Completed" = student_pace.status 'Completed' OR a passed official PACE test.
function buildLastCompleted(studentPaces, passedSpIds) {
  const map = {}; // student_id → { subject: maxNum }
  studentPaces.forEach((sp) => {
    const subject = sp.pace_module?.subject;
    const num     = sp.pace_module?.module_number;
    if (!subject || num == null) return;
    const done = sp.status === "Completed" || passedSpIds.has(sp.sp_id);
    if (!done) return;
    if (!map[sp.student_id]) map[sp.student_id] = {};
    if (map[sp.student_id][subject] == null || num > map[sp.student_id][subject]) {
      map[sp.student_id][subject] = num;
    }
  });
  return map;
}

// student_id → subject → last projected PACE for the active year (band end)
function buildYearEnd(projections) {
  const map = {};
  (projections ?? []).forEach((p) => {
    const end = p.pace_start != null ? p.pace_start + (p.pace_count ?? 0) - 1 : null;
    if (end == null) return;
    if (!map[p.student_id]) map[p.student_id] = {};
    if (map[p.student_id][p.subject] == null || end > map[p.student_id][p.subject]) {
      map[p.student_id][p.subject] = end;
    }
  });
  return map;
}

/**
 * Preview the year-end rollover for the active school year.
 * Returns each student with their carried-over basis, completion, and the
 * auto-detected promotion (grade_level bumped when they finished the core band).
 */
export const previewRollover = async () => {
  const { data: sy } = await supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date, end_date")
    .eq("is_active", true)
    .maybeSingle();
  if (!sy) throw new Error("No active school year to roll over from");

  const { data: grades } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name, level_order")
    .order("level_order");
  const gradeList = grades ?? [];
  // Next grade by level_order
  const nextGradeOf = (gl_id) => {
    const cur = gradeList.find((g) => g.gl_id === gl_id);
    if (!cur) return null;
    const higher = gradeList
      .filter((g) => g.level_order > cur.level_order)
      .sort((a, b) => a.level_order - b.level_order);
    return higher[0] ?? null;
  };

  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id, first_name, last_name, gl_id, grade_level(level_name, level_order)")
    .order("last_name");
  const studentList = students ?? [];
  if (!studentList.length) return { schoolYear: sy, students: [] };

  const studentIds = studentList.map((s) => s.student_id);

  const [{ data: sps }, { data: projs }] = await Promise.all([
    supabaseAdmin
      .from("student_pace")
      .select("sp_id, student_id, status, pace_module!inner(subject, module_number)")
      .in("student_id", studentIds),
    supabaseAdmin
      .from("pace_quarterly_projection")
      .select("student_id, subject, pace_start, pace_count")
      .eq("sy_id", sy.sy_id)
      .in("student_id", studentIds),
  ]);

  // Passing official PACE tests
  const spIds = (sps ?? []).map((s) => s.sp_id);
  let passedSpIds = new Set();
  if (spIds.length) {
    const { data: results } = await supabaseAdmin
      .from("pace_test_result")
      .select("sp_id, passed, score")
      .in("sp_id", spIds);
    passedSpIds = new Set(
      (results ?? []).filter((r) => r.passed === true || (r.score != null && r.score >= 90)).map((r) => r.sp_id)
    );
  }

  const lastCompleted = buildLastCompleted(sps ?? [], passedSpIds);
  const yearEnd       = buildYearEnd(projs);

  const rows = studentList.map((s) => {
    const done = lastCompleted[s.student_id] ?? {};
    const end  = yearEnd[s.student_id] ?? {};

    // Finished the grade = every CORE subject reached its year-end projected PACE
    const coreStatus = CORE_SUBJECTS.map((subj) => ({
      subject:   subj,
      completed: done[subj] ?? null,
      target:    end[subj] ?? null,
      met:       end[subj] != null && done[subj] != null && done[subj] >= end[subj],
    }));
    const finishedGrade = coreStatus.every((c) => c.met);

    const next        = nextGradeOf(s.gl_id);
    const canPromote  = finishedGrade && !!next;
    const proposedGl  = canPromote ? next.gl_id : s.gl_id;

    return {
      student_id:    s.student_id,
      name:          `${s.last_name}, ${s.first_name}`,
      currentGlId:   s.gl_id,
      currentGrade:  s.grade_level?.level_name ?? "—",
      proposedGlId:  proposedGl,
      proposedGrade: (gradeList.find((g) => g.gl_id === proposedGl)?.level_name) ?? s.grade_level?.level_name ?? "—",
      finishedGrade,
      canPromote,
      coreStatus,
      // basis for the new year's projection = last completed PACE per subject
      basis:         done,
    };
  });

  return {
    schoolYear: sy,
    coreSubjects: CORE_SUBJECTS,
    grades: gradeList,
    students: rows,
  };
};

/**
 * Commit the rollover: create + activate the new school year, set each
 * student's (possibly promoted) grade, and seed their new-year projection
 * from the supplied per-subject basis (last completed PACE → next PACEs).
 */
export const commitRollover = async ({ year_label, start_date, end_date, students }) => {
  const cleanSchoolYear = validateSchoolYear(
    { year_label, start_date, end_date },
    { mustBeCurrent: true }
  );
  if (!Array.isArray(students) || !students.length) {
    throw new Error("students[] is required");
  }

  // 1. Create the new school year and make it the only active one
  const newSy = await createSchoolYear(cleanSchoolYear);
  await activateSchoolYear(newSy.sy_id);

  // 2. Per student: update grade, seed projection
  const projectionRows = [];
  for (const st of students) {
    const studentId = Number(st.student_id);
    if (st.gl_id != null) {
      await supabaseAdmin.from("student").update({ gl_id: st.gl_id }).eq("student_id", studentId);
    }

    const basis = st.basis ?? {};
    Object.entries(basis).forEach(([subject, lastNum]) => {
      const start = Number(lastNum);
      if (!start || isNaN(start) || start <= 0) return;
      for (let q = 1; q <= 4; q++) {
        const paceStart = start + 1 + (q - 1) * PER_QUARTER;
        projectionRows.push({
          student_id: studentId,
          sy_id:      newSy.sy_id,
          quarter:    q,
          subject,
          pace_start: paceStart,
          pace_end:   paceStart + PER_QUARTER - 1,
          pace_count: PER_QUARTER,
          status_r0:  "not-started",
          status_r1:  "not-started",
          status_r2:  "not-started",
        });
      }
    });
  }

  if (projectionRows.length) {
    const { error: projErr } = await supabaseAdmin
      .from("pace_quarterly_projection")
      .upsert(projectionRows, { onConflict: "student_id,sy_id,quarter,subject" });
    if (projErr) throw new Error(projErr.message);
  }

  return {
    sy_id:       newSy.sy_id,
    year_label:  newSy.year_label,
    studentsProjected: students.length,
    rowsGenerated:     projectionRows.length,
  };
};
