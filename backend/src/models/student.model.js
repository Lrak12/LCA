import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "student";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active), grade_level(gl_id, level_name, sy_id)");

export const findById = (student_id) =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active), grade_level(gl_id, level_name, sy_id)").eq("student_id", student_id).single();

export const findByUserId = (user_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("user_id", user_id).single();

export const findBySchoolId = (school_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("school_id", school_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (student_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("student_id", student_id).select().single();

export const remove = (student_id) =>
  supabaseAdmin.from(TABLE).delete().eq("student_id", student_id);
