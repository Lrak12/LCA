import { supabaseAdmin } from "../config/supabase.js";

const getActiveSY = async () => {
  const { data, error } = await supabaseAdmin
    .from("school_year")
    .select("sy_id")
    .eq("is_active", true)
    .single();
  if (error) throw new Error("No active school year found");
  return data;
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

const saveStudentAssignment = async (student_id, grade, recorded_by = null) => {
  await closeStudentAssignment(student_id, grade.sy_id);
  if (!grade.teacher_id) return;

  const { error } = await supabaseAdmin.from("student_supervisor_history").insert({
    student_id: Number(student_id),
    teacher_id: grade.teacher_id,
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
    .select("gl_id, level_name, level_order, teacher_id")
    .eq("sy_id", sy.sy_id)
    .order("level_order");
  if (error) throw new Error(error.message);

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
      name:        gl.level_name,
      grade:       gl.level_name.toUpperCase(),
      level_order: gl.level_order,
      students:    studentCount ?? 0,
      faculty,
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

  // Guardrail: a student already enrolled in a grade level cannot be enrolled
  // into another. They must be removed (unassigned) from their current grade
  // first. This backs up the UI, which only lists unassigned students.
  const { data: alreadyAssigned, error: chkErr } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .in("student_id", student_ids)
    .not("gl_id", "is", null);
  if (chkErr) throw new Error(chkErr.message);
  if (alreadyAssigned?.length) {
    throw new Error(
      "One or more selected students are already enrolled in a grade level. Remove them from their current grade before enrolling.",
    );
  }

  const { error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: gl.gl_id })
    .in("student_id", student_ids);
  if (error) throw new Error(error.message);

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

  const { data, error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: null })
    .eq("student_id", student_id)
    .eq("gl_id", gl_id)
    .select("student_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Student is not enrolled in this grade level.");
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

  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .eq("gl_id", data.gl_id);
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

  const { data: students } = await supabaseAdmin
    .from("student")
    .select("student_id")
    .eq("gl_id", grade.gl_id);
  for (const student of students ?? []) {
    await closeStudentAssignment(student.student_id, grade.sy_id);
  }
  return { unassigned: true, ...data };
};
