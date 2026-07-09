import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "grade_level";

export const findAll = (sy_id) => {
  const query = supabaseAdmin.from(TABLE).select("*").order("level_order");
  return sy_id ? query.eq("sy_id", sy_id) : query;
};

export const findById = (gl_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("gl_id", gl_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (gl_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("gl_id", gl_id).select().single();

export const remove = (gl_id) =>
  supabaseAdmin.from(TABLE).delete().eq("gl_id", gl_id);
