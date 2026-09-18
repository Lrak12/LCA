import { supabaseAdmin } from "../config/supabase.js";
import { isSectionSchemaUnavailable } from "../helpers/sectionSchema.js";

const getActiveSY = async () => {
  const { data, error } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .single();
  if (error) throw new Error("No active school year found");
  return data;
};

const getUnsectionedStudents = async (gl_id) => {
  const result = await supabaseAdmin.from("student")
    .select("student_id").eq("gl_id", gl_id).is("section_id", null);
  if (!result.error) return result.data ?? [];
  if (!isSectionSchemaUnavailable(result.error)) throw new Error(result.error.message);
  const fallback = await supabaseAdmin.from("student")
    .select("student_id").eq("gl_id", gl_id);
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data ?? [];
};

const closeStudentAssignment = async (student_id, sy_id) => {
  const { error } = await supabaseAdmin
    .from("student_supervisor_history")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("student_id", Number(student_id))
    .eq("sy_id", Number(sy_id))
    .is("unassigned_at", null);
  if (error) throw new Error(error.message);
};

const saveStudentAssignment = async (student_id, grade, recorded_by = null, teacher_id = grade.teacher_id) => {
  await closeStudentAssignment(student_id, grade.sy_id);
  if (!teacher_id) return;

  const { error } = await supabaseAdmin.from("student_supervisor_history").insert({
    student_id: Number(student_id),
    teacher_id,
    sy_id: grade.sy_id,
    gl_id: grade.gl_id,
    grade_level_name: grade.level_name,
    recorded_by: recorded_by ? Number(recorded_by) : null,
    reason: "Grade level assignment changed",
  });
  if (error) throw new Error(error.message);
};

export const getAllGradeLevels = async () => {
  const sy = await getActiveSY();

  const { data: levels, error } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, sy_id, level_name, level_order, teacher_id")
    .eq("sy_id", sy.sy_id)
    .order("level_order");
  if (error) throw new Error(error.message);

  const ids = (levels ?? []).map((level) => level.gl_id);
  const [{ data: sectionRows, error: sectionError }, { data: studentRows, error: studentError }] = ids.length
    ? await Promise.all([
        supabaseAdmin.from("grade_section").select("section_id, gl_id, name, teacher_id, created_at").in("gl_id", ids).order("name"),
        supabaseAdmin.from("student").select("student_id, gl_id, section_id, first_name, last_name").in("gl_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (sectionError && !isSectionSchemaUnavailable(sectionError)) throw new Error(sectionError.message);
  if (studentError && !isSectionSchemaUnavailable(studentError)) throw new Error(studentError.message);
  const sectionsEnabled = !sectionError && !studentError;
  const sections = sectionsEnabled ? sectionRows : [];
  const fallbackStudents = !sectionsEnabled && ids.length
    ? await supabaseAdmin.from("student").select("student_id, gl_id").in("gl_id", ids)
    : { data: [], error: null };
  if (fallbackStudents.error) throw new Error(fallbackStudents.error.message);
  const students = sectionsEnabled ? studentRows : fallbackStudents.data;
  const teacherIds = [...new Set((sections ?? []).map((section) => section.teacher_id).filter(Boolean))];
  const { data: sectionTeachers, error: teacherError } = teacherIds.length
    ? await supabaseAdmin.from("teacher").select("teacher_id, first_name, last_name").in("teacher_id", teacherIds)
    : { data: [], error: null };
  if (teacherError) throw new Error(teacherError.message);
  const teacherNames = new Map((sectionTeachers ?? []).map((teacher) => [teacher.teacher_id, `${teacher.first_name} ${teacher.last_name}`]));

  const results = await Promise.all((levels ?? []).map(async (gl) => {
    const [{ count: studentCount }, { data: teacherRow }] = await Promise.all([
      supabaseAdmin
        .from("student")
        .select("student_id", { count: "exact", head: true })
        .eq("gl_id", gl.gl_id),
      gl.teacher_id
        ? supabaseAdmin
            .from("teacher")
            .select("teacher_id, first_name, last_name")
            .eq("teacher_id", gl.teacher_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const faculty = teacherRow
      ? [{ id: teacherRow.teacher_id, name: `${teacherRow.first_name} ${teacherRow.last_name}` }]
      : [];

    return {
      id:          gl.gl_id,
      sy_id:       gl.sy_id,
      name:        gl.level_name,
      grade:       gl.level_name.toUpperCase(),
      level_order: gl.level_order,
      students:    studentCount ?? 0,
      faculty,
      sections_enabled: sectionsEnabled,
      sections: (sections ?? []).filter((section) => section.gl_id === gl.gl_id).map((section) => ({
        id: section.section_id,
        name: section.name,
        teacher_id: section.teacher_id,
        teacher_name: teacherNames.get(section.teacher_id) ?? null,
        students: (students ?? []).filter((student) => Number(student.section_id) === Number(section.section_id)).length,
        members: (students ?? []).filter((student) => Number(student.section_id) === Number(section.section_id)).map((student) => ({
          student_id: student.student_id,
          gl_id: student.gl_id,
          section_id: student.section_id,
          first_name: student.first_name,
          last_name: student.last_name,
        })),
        created_at: section.created_at,
      })),
      unsectioned_students: (students ?? []).filter((student) => student.gl_id === gl.gl_id && !student.section_id).length,
    };
  }));

  return results;
};

export const enrollStudents = async (gl_id, student_ids, recorded_by = null) => {
  const { data: gl, error: glErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, sy_id, level_name, teacher_id")
    .eq("gl_id", gl_id)
    .single();
  if (glErr) throw new Error("Grade level not found");
  const activeSy = await getActiveSY();
  if (Number(gl.sy_id) !== Number(activeSy.sy_id)) {
    throw new Error("Students can only be enrolled in a grade level from the active school year.");
  }

  // Guardrail: block only assignments that belong to this active school year.
  // A non-null gl_id from a previous year is historical and must not prevent the
  // student from being assigned to a new-year grade level.
  const { data: alreadyAssigned, error: chkErr } = await supabaseAdmin
    .from("student")
    .select("student_id, grade_level!student_gl_id_fkey(sy_id)")
    .in("student_id", student_ids)
    .not("gl_id", "is", null);
  if (chkErr) throw new Error(chkErr.message);
  const assignedThisYear = (alreadyAssigned ?? []).filter(
    (student) => Number(student.grade_level?.sy_id) === Number(gl.sy_id),
  );
  if (assignedThisYear.length) {
    throw new Error(
      "One or more selected students are already enrolled in a grade level. Remove them from their current grade before enrolling.",
    );
  }

  const { error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: gl.gl_id, section_id: null })
    .in("student_id", student_ids);
  if (error) {
    if (!isSectionSchemaUnavailable(error)) throw new Error(error.message);
    const fallback = await supabaseAdmin.from("student")
      .update({ gl_id: gl.gl_id }).in("student_id", student_ids);
    if (fallback.error) throw new Error(fallback.error.message);
  }

  for (const studentId of student_ids) {
    await saveStudentAssignment(studentId, gl, recorded_by);
  }

  return { enrolled: student_ids.length };
};

// Remove (unassign) a student from a grade level: clears gl_id so the student
// becomes Unassigned and can be enrolled elsewhere. Scoped to gl_id so a stale
// request can't unassign a student who has since moved to another grade.
export const removeStudent = async (gl_id, student_id) => {
  const { data: grade, error: gradeErr } = await supabaseAdmin
    .from("grade_level")
    .select("sy_id")
    .eq("gl_id", gl_id)
    .single();
  if (gradeErr) throw new Error("Grade level not found");

  const { data: updated, error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: null, section_id: null })
    .eq("student_id", student_id)
    .eq("gl_id", gl_id)
    .select("student_id")
    .maybeSingle();
  if (error && !isSectionSchemaUnavailable(error)) throw new Error(error.message);
  const fallback = error
    ? await supabaseAdmin.from("student").update({ gl_id: null })
        .eq("student_id", student_id).eq("gl_id", gl_id).select("student_id").maybeSingle()
    : { data: updated, error: null };
  if (fallback.error) throw new Error(fallback.error.message);
  const data = fallback.data;
  if (!data) throw new Error("Student is not enrolled in this grade level.");
  const { error: placementError } = await supabaseAdmin.from("student_section_assignment")
    .delete().eq("student_id", Number(student_id)).eq("gl_id", Number(gl_id));
  if (placementError && !isSectionSchemaUnavailable(placementError)) throw new Error(placementError.message);
  await closeStudentAssignment(student_id, grade.sy_id);
  return { removed: true };
};

export const assignTeacher = async (gl_id, teacher_id, recorded_by = null) => {
  const sy = await getActiveSY();

  // Guardrail: a teacher can supervise only one grade level per school year.
  // This backs up the UI, which greys out supervisors already assigned elsewhere.
  const { data: heldElsewhere, error: chkErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name")
    .eq("sy_id", sy.sy_id)
    .eq("teacher_id", teacher_id)
    .neq("gl_id", gl_id)
    .maybeSingle();
  if (chkErr) throw new Error(chkErr.message);
  if (heldElsewhere) {
    throw new Error(
      `This supervisor is already assigned to ${heldElsewhere.level_name}. Remove them from that grade level first.`,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("grade_level")
    .update({ teacher_id })
    .eq("gl_id", gl_id)
    .select("gl_id, sy_id, level_name, teacher_id")
    .single();
  if (error) throw new Error(error.message);

  const students = await getUnsectionedStudents(data.gl_id);
  for (const student of students ?? []) {
    await saveStudentAssignment(student.student_id, data, recorded_by);
  }
  return data;
};

// Unassign the supervisor from a grade level: clears teacher_id so the grade has
// no supervisor and that teacher becomes available for another grade level.
// Scoped to teacher_id when given, so a stale request can't unassign a supervisor
// who has since been replaced.
export const unassignTeacher = async (gl_id, teacher_id) => {
  const { data: grade, error: gradeErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id, sy_id")
    .eq("gl_id", gl_id)
    .single();
  if (gradeErr) throw new Error("Grade level not found");

  let query = supabaseAdmin
    .from("grade_level")
    .update({ teacher_id: null })
    .eq("gl_id", gl_id)
    .not("teacher_id", "is", null);
  if (teacher_id) query = query.eq("teacher_id", teacher_id);

  const { data, error } = await query.select("gl_id, level_name").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This grade level has no supervisor assigned.");

  const students = await getUnsectionedStudents(grade.gl_id);
  for (const student of students ?? []) {
    await closeStudentAssignment(student.student_id, grade.sy_id);
  }
  return { unassigned: true, ...data };
};

const getActiveGrade = async (gl_id) => {
  const sy = await getActiveSY();
  const { data, error } = await supabaseAdmin.from("grade_level")
    .select("gl_id, sy_id, level_name, teacher_id")
    .eq("gl_id", Number(gl_id)).eq("sy_id", sy.sy_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Grade level not found in the active school year.");
  return data;
};

const getGradeSection = async (gl_id, section_id) => {
  const grade = await getActiveGrade(gl_id);
  const { data, error } = await supabaseAdmin.from("grade_section")
    .select("section_id, gl_id, name, teacher_id")
    .eq("section_id", Number(section_id)).eq("gl_id", grade.gl_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Section not found in this grade level.");
  return { grade, section: data };
};

export const createGradeSection = async (gl_id, name) => {
  const grade = await getActiveGrade(gl_id);
  const sectionName = String(name ?? "").trim();
  if (!sectionName || sectionName.length > 80) throw new Error("Section name must be 1–80 characters.");
  const { data, error } = await supabaseAdmin.from("grade_section")
    .insert({ gl_id: grade.gl_id, name: sectionName }).select().single();
  if (error) throw new Error(error.code === "23505" ? "This section already exists in this grade level." : error.message);
  return data;
};

export const assignStudentsToGradeSection = async (gl_id, section_id, student_ids, recorded_by = null) => {
  const { grade, section } = await getGradeSection(gl_id, section_id);
  const ids = [...new Set((student_ids ?? []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw new Error("Select at least one student.");
  const { data: students, error: studentError } = await supabaseAdmin.from("student")
    .select("student_id, gl_id, grade_level!student_gl_id_fkey(sy_id)").in("student_id", ids);
  if (studentError) throw new Error(studentError.message);
  if ((students ?? []).length !== ids.length) throw new Error("One or more students were not found.");
  if (students.some((student) => student.gl_id && Number(student.gl_id) !== Number(grade.gl_id)
    && Number(student.grade_level?.sy_id) === Number(grade.sy_id))) {
    throw new Error("A selected student is enrolled in another grade this school year. Remove them there first.");
  }
  const { error } = await supabaseAdmin.from("student")
    .update({ gl_id: grade.gl_id, section_id: section.section_id }).in("student_id", ids);
  if (error) throw new Error(error.message);
  const { error: placementError } = await supabaseAdmin.from("student_section_assignment")
    .upsert(ids.map((student_id) => ({ student_id, gl_id: grade.gl_id, section_id: section.section_id, assigned_at: new Date().toISOString() })), { onConflict: "student_id,gl_id" });
  if (placementError) throw new Error(placementError.message);
  for (const studentId of ids) await saveStudentAssignment(studentId, grade, recorded_by, section.teacher_id);
  return { assigned: ids.length };
};

export const removeStudentFromGradeSection = async (gl_id, section_id, student_id, recorded_by = null) => {
  const { grade, section } = await getGradeSection(gl_id, section_id);
  const { data, error } = await supabaseAdmin.from("student")
    .update({ section_id: null })
    .eq("student_id", Number(student_id)).eq("gl_id", grade.gl_id).eq("section_id", section.section_id)
    .select("student_id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Student is not assigned to this section.");
  const { error: placementError } = await supabaseAdmin.from("student_section_assignment")
    .delete().eq("student_id", data.student_id).eq("gl_id", grade.gl_id);
  if (placementError) throw new Error(placementError.message);
  await saveStudentAssignment(data.student_id, grade, recorded_by);
  return { removed: true };
};

export const assignGradeSectionTeacher = async (gl_id, section_id, teacher_id, recorded_by = null) => {
  const { grade, section } = await getGradeSection(gl_id, section_id);
  const { data: teacher, error: teacherError } = await supabaseAdmin.from("teacher")
    .select("teacher_id").eq("teacher_id", Number(teacher_id)).maybeSingle();
  if (teacherError) throw new Error(teacherError.message);
  if (!teacher) throw new Error("Supervisor not found.");
  const { error } = await supabaseAdmin.from("grade_section")
    .update({ teacher_id: teacher.teacher_id }).eq("section_id", section.section_id);
  if (error) throw new Error(error.message);
  const { data: students, error: studentError } = await supabaseAdmin.from("student")
    .select("student_id").eq("section_id", section.section_id);
  if (studentError) throw new Error(studentError.message);
  for (const student of students ?? []) await saveStudentAssignment(student.student_id, grade, recorded_by, teacher.teacher_id);
  return { assigned: true };
};

export const unassignGradeSectionTeacher = async (gl_id, section_id, recorded_by = null) => {
  const { grade, section } = await getGradeSection(gl_id, section_id);
  const { error } = await supabaseAdmin.from("grade_section")
    .update({ teacher_id: null }).eq("section_id", section.section_id);
  if (error) throw new Error(error.message);
  const { data: students, error: studentError } = await supabaseAdmin.from("student")
    .select("student_id").eq("section_id", section.section_id);
  if (studentError) throw new Error(studentError.message);
  for (const student of students ?? []) await saveStudentAssignment(student.student_id, grade, recorded_by, null);
  return { unassigned: true };
};
