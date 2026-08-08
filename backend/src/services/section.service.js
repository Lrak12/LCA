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

export const enrollStudents = async (gl_id, student_ids) => {
  const { data: gl, error: glErr } = await supabaseAdmin
    .from("grade_level")
    .select("gl_id")
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

  return { enrolled: student_ids.length };
};

// Remove (unassign) a student from a grade level: clears gl_id so the student
// becomes Unassigned and can be enrolled elsewhere. Scoped to gl_id so a stale
// request can't unassign a student who has since moved to another grade.
export const removeStudent = async (gl_id, student_id) => {
  const { data, error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: null })
    .eq("student_id", student_id)
    .eq("gl_id", gl_id)
    .select("student_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Student is not enrolled in this grade level.");
  return { removed: true };
};

export const assignTeacher = async (gl_id, teacher_id) => {
  const { data, error } = await supabaseAdmin
    .from("grade_level")
    .update({ teacher_id })
    .eq("gl_id", gl_id)
    .select("gl_id, level_name, teacher_id")
    .single();
  if (error) throw new Error(error.message);
  return data;
};
