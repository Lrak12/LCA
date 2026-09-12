import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "school_year";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*").order("start_date", { ascending: false });

export const findById = (sy_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("sy_id", sy_id).single();

export const findActive = () =>
  supabaseAdmin.from(TABLE).select("*").eq("is_active", true).maybeSingle();

export const findGradeLevels = (sy_id) =>
  supabaseAdmin
    .from("grade_level")
    .select("gl_id, level_name, teacher_id")
    .eq("sy_id", sy_id);

export const findStudentAssignmentHistory = (sy_id) =>
  supabaseAdmin
    .from("student_supervisor_history")
    .select("assignment_id, student_id, teacher_id, gl_id, assigned_at, unassigned_at")
    .eq("sy_id", sy_id);

export const findStudentGradeLevels = (student_ids) =>
  supabaseAdmin
    .from("student")
    .select("student_id, gl_id")
    .in("student_id", student_ids);

export const setStudentGradeLevel = (student_ids, gl_id) =>
  supabaseAdmin
    .from("student")
    .update({ gl_id })
    .in("student_id", student_ids);

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (sy_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("sy_id", sy_id).select().single();

export const setActive = async (sy_id) => {
  const { error } = await supabaseAdmin.from(TABLE).update({ is_active: false }).neq("sy_id", sy_id);
  if (error) return { data: null, error };
  return supabaseAdmin.from(TABLE).update({ is_active: true }).eq("sy_id", sy_id).select().single();
};
