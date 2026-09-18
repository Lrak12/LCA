import { supabaseAdmin } from "../config/supabase.js";
import { collectTeacherScope } from "../helpers/teacherScope.js";
import { isSectionSchemaUnavailable } from "../helpers/sectionSchema.js";

// The grade-level supervisor keeps only unsectioned students. A section
// supervisor receives only students explicitly placed in their section(s).
export const getTeacherScopeById = async (teacher_id, sy_id = null) => {
  let yearId = Number(sy_id) || null;
  if (!yearId) {
    const { data: year, error } = await supabaseAdmin.from("school_year")
      .select("sy_id").eq("is_active", true).maybeSingle();
    if (error) throw new Error(error.message);
    yearId = year?.sy_id ?? null;
  }
  if (!yearId) return { gradeLevels: [], glIds: [], sectionIds: [], studentIds: [] };

  const { data: grades, error: gradeError } = await supabaseAdmin.from("grade_level")
    .select("gl_id, level_name, sy_id, teacher_id")
    .eq("sy_id", yearId);
  if (gradeError) throw new Error(gradeError.message);
  const allGradeIds = (grades ?? []).map((grade) => grade.gl_id);
  const { data: sectionRows, error: sectionError } = allGradeIds.length
    ? await supabaseAdmin.from("grade_section")
        .select("section_id, gl_id, teacher_id")
        .in("gl_id", allGradeIds).eq("teacher_id", Number(teacher_id))
    : { data: [], error: null };
  if (sectionError && !isSectionSchemaUnavailable(sectionError)) throw new Error(sectionError.message);
  const sectionsEnabled = !sectionError;
  const sections = sectionsEnabled ? sectionRows : [];
  const gradeIds = [...new Set([
    ...(grades ?? []).filter((grade) => Number(grade.teacher_id) === Number(teacher_id)).map((grade) => grade.gl_id),
    ...(sections ?? []).map((section) => section.gl_id),
  ])];
  const { data: studentRows, error: studentError } = gradeIds.length
    ? await supabaseAdmin.from("student").select(sectionsEnabled ? "student_id, gl_id, section_id" : "student_id, gl_id").in("gl_id", gradeIds)
    : { data: [], error: null };
  if (studentError && !isSectionSchemaUnavailable(studentError)) throw new Error(studentError.message);
  const legacyStudents = studentError && gradeIds.length
    ? await supabaseAdmin.from("student").select("student_id, gl_id").in("gl_id", gradeIds)
    : { data: [], error: null };
  if (legacyStudents.error) throw new Error(legacyStudents.error.message);
  const { glIds, sectionIds, studentIds } = collectTeacherScope(grades ?? [], studentError ? [] : sections ?? [], studentError ? legacyStudents.data ?? [] : studentRows ?? [], teacher_id);
  return {
    gradeLevels: (grades ?? []).filter((grade) => glIds.includes(grade.gl_id)),
    glIds,
    sectionIds,
    studentIds,
  };
};

export const teacherOwnsStudent = async (teacher_id, student_id) => {
  const scope = await getTeacherScopeById(teacher_id);
  return scope.studentIds.includes(Number(student_id));
};
