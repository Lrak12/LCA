import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "pace_module";

export const findAll = (gl_id) => {
  const query = supabaseAdmin.from(TABLE).select("*, grade_level(level_name, level_order)").order("module_number");
  return gl_id ? query.eq("gl_id", gl_id) : query;
};

export const findById = (module_id) =>
  supabaseAdmin.from(TABLE).select("*, grade_level(level_name, level_order)").eq("module_id", module_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (module_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("module_id", module_id).select().single();

export const remove = (module_id) =>
  supabaseAdmin.from(TABLE).delete().eq("module_id", module_id);
