import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "school_year";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*").order("start_date", { ascending: false });

export const findById = (sy_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("sy_id", sy_id).single();

export const findActive = () =>
  supabaseAdmin.from(TABLE).select("*").eq("is_active", true).maybeSingle();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (sy_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("sy_id", sy_id).select().single();

export const setActive = async (sy_id) => {
  await supabaseAdmin.from(TABLE).update({ is_active: false }).neq("sy_id", sy_id);
  return supabaseAdmin.from(TABLE).update({ is_active: true }).eq("sy_id", sy_id).select().single();
};
