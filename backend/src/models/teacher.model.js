import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "teacher";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active)");

export const findById = (teacher_id) =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active)").eq("teacher_id", teacher_id).single();

export const findByUserId = (user_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("user_id", user_id).single();

export const findBySchoolId = (school_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("school_id", school_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (teacher_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("teacher_id", teacher_id).select().single();

export const remove = (teacher_id) =>
  supabaseAdmin.from(TABLE).delete().eq("teacher_id", teacher_id);