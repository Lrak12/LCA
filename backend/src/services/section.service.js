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

  const { error } = await supabaseAdmin
    .from("student")
    .update({ gl_id: gl.gl_id })
    .in("student_id", student_ids);
  if (error) throw new Error(error.message);

  return { enrolled: student_ids.length };
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
