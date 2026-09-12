import * as SchoolYearModel from "../models/schoolYear.model.js";
import { getSchoolYearKey, validateSchoolYear } from "../helpers/schoolYearValidation.js";

const schoolYearEnd = (schoolYear) => new Date(`${schoolYear.end_date}T23:59:59.999Z`);

// Return the last valid assignment for each student at the point represented by
// this school year. An ongoing year restores only open enrollments. A finished
// year restores the assignment held at its end. Students whose target-year
// history was explicitly closed are cleared instead of being re-enrolled.
const selectHistoricalAssignments = (schoolYear, gradeLevels, historyRows) => {
  const validGradeLevelIds = new Set((gradeLevels ?? []).map((grade) => String(grade.gl_id)));
  const end = schoolYearEnd(schoolYear);
  const today = new Date().toISOString().slice(0, 10);
  const isFinishedYear = schoolYear.end_date < today;
  const effectiveEnd = isFinishedYear ? end : new Date();

  const validRows = (historyRows ?? []).filter((row) => {
    const assignedAt = new Date(row.assigned_at);
    return validGradeLevelIds.has(String(row.gl_id)) &&
      !Number.isNaN(assignedAt.getTime()) &&
      assignedAt <= effectiveEnd;
  });

  const eligibleRows = validRows
    .filter((row) => {
      if (!row.unassigned_at) return true;
      return isFinishedYear && String(row.unassigned_at).slice(0, 10) >= schoolYear.end_date;
    })
    .sort((left, right) => {
      const timeDifference = new Date(right.assigned_at) - new Date(left.assigned_at);
      return timeDifference || Number(right.assignment_id) - Number(left.assignment_id);
    });

  const assignments = new Map();
  for (const row of eligibleRows) {
    if (!assignments.has(row.student_id)) assignments.set(row.student_id, row.gl_id);
  }
  for (const row of validRows) {
    if (!assignments.has(row.student_id)) assignments.set(row.student_id, null);
  }
  return assignments;
};

const groupStudentsByGradeLevel = (studentGradeLevels) => {
  const groups = new Map();
  for (const [studentId, gradeLevelId] of studentGradeLevels) {
    const key = gradeLevelId == null ? null : gradeLevelId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(studentId);
  }
  return groups;
};

const applyStudentGradeLevels = async (studentGradeLevels) => {
  for (const [gradeLevelId, studentIds] of groupStudentsByGradeLevel(studentGradeLevels)) {
    const { error } = await SchoolYearModel.setStudentGradeLevel(studentIds, gradeLevelId);
    if (error) throw new Error(error.message);
  }
};

const getHistoricalAssignments = async (schoolYear) => {
  const [gradeLevelsResult, historyResult] = await Promise.all([
    SchoolYearModel.findGradeLevels(schoolYear.sy_id),
    SchoolYearModel.findStudentAssignmentHistory(schoolYear.sy_id),
  ]);
  if (gradeLevelsResult.error) throw new Error(gradeLevelsResult.error.message);
  if (historyResult.error) throw new Error(historyResult.error.message);

  return selectHistoricalAssignments(
    schoolYear,
    gradeLevelsResult.data,
    historyResult.data,
  );
};

const checkDuplicate = async (year_label, start_date, end_date, ignoredId = null) => {
  const { data: years, error } = await SchoolYearModel.findAll();
  if (error) throw new Error(error.message);

  const key = getSchoolYearKey(year_label);
  const duplicate = (years ?? []).find((year) =>
    Number(year.sy_id) !== Number(ignoredId) &&
    (getSchoolYearKey(year.year_label) === key ||
      (year.start_date === start_date && year.end_date === end_date))
  );

  if (duplicate) {
    const err = new Error("This school year already exists.");
    err.statusCode = 409;
    throw err;
  }
};

export const listSchoolYears = async () => {
  const { data, error } = await SchoolYearModel.findAll();
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createSchoolYear = async ({ year_label, start_date, end_date }) => {
  const clean = validateSchoolYear({ year_label, start_date, end_date });

  const { data: existingYears, error: yearsError } = await SchoolYearModel.findAll();
  if (yearsError) throw new Error(yearsError.message);
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = (existingYears ?? []).find(
    (year) => year.start_date <= today && today <= year.end_date,
  );
  if (currentYear) {
    const err = new Error(
      `A new school year cannot be created until the current school year ${currentYear.year_label} ends on ${currentYear.end_date}.`,
    );
    err.statusCode = 409;
    throw err;
  }

  await checkDuplicate(clean.year_label, clean.start_date, clean.end_date);

  const { data, error } = await SchoolYearModel.create({
    ...clean,
    is_active: false,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const updateSchoolYear = async (sy_id, { year_label, start_date, end_date }) => {
  const { data: oldYear, error: findError } = await SchoolYearModel.findById(sy_id);
  if (findError || !oldYear) throw new Error("School year not found.");

  const payload = validateSchoolYear(
    {
      year_label: year_label ?? oldYear.year_label,
      start_date: start_date ?? oldYear.start_date,
      end_date: end_date ?? oldYear.end_date,
    },
    { mustBeCurrent: oldYear.is_active }
  );
  await checkDuplicate(payload.year_label, payload.start_date, payload.end_date, sy_id);

  const { data, error } = await SchoolYearModel.update(sy_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

// Activates the year and restores the last student-to-grade assignment that was
// effective during it. Since grade levels are school-year-specific and carry
// their own teacher_id, this also restores each student's previous supervisor.
export const activateSchoolYear = async (sy_id, { allowHistorical = false } = {}) => {
  const { data: schoolYear, error: findError } = await SchoolYearModel.findById(sy_id);
  if (findError || !schoolYear) throw new Error("School year not found.");
  validateSchoolYear(schoolYear, {
    mustBeCurrent: true,
    allowOldLabel: true,
    allowPast: allowHistorical,
  });

  const assignments = await getHistoricalAssignments(schoolYear);
  const studentIds = [...assignments.keys()];
  const { data: previousActive, error: activeError } = await SchoolYearModel.findActive();
  if (activeError) throw new Error(activeError.message);

  let originalAssignments = new Map();
  if (studentIds.length > 0) {
    const { data: students, error: studentsError } =
      await SchoolYearModel.findStudentGradeLevels(studentIds);
    if (studentsError) throw new Error(studentsError.message);
    originalAssignments = new Map((students ?? []).map((student) => [student.student_id, student.gl_id]));
  }

  const { data, error } = await SchoolYearModel.setActive(sy_id);
  if (error) {
    if (previousActive && Number(previousActive.sy_id) !== Number(sy_id)) {
      await SchoolYearModel.setActive(previousActive.sy_id);
    }
    throw new Error(error.message);
  }

  try {
    if (assignments.size > 0) await applyStudentGradeLevels(assignments);
  } catch (restoreError) {
    // Supabase calls are not transactional here, so return both the student
    // pointers and active-year flag to their original state if restoration fails.
    try {
      if (originalAssignments.size > 0) await applyStudentGradeLevels(originalAssignments);
      if (previousActive && Number(previousActive.sy_id) !== Number(sy_id)) {
        const rollback = await SchoolYearModel.setActive(previousActive.sy_id);
        if (rollback.error) throw new Error(rollback.error.message);
      }
    } catch (rollbackError) {
      restoreError.message = `${restoreError.message} Rollback also failed: ${rollbackError.message}`;
    }
    throw restoreError;
  }

  const restoredStudents = [...assignments.values()].filter((glId) => glId != null).length;
  const clearedStudents = assignments.size - restoredStudents;
  return {
    ...data,
    restored_students: restoredStudents,
    cleared_students: clearedStudents,
  };
};
