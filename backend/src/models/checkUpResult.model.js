import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "check_up_result";

export const findByPace = (sp_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("sp_id", sp_id).order("attempt_number");

export const findById = (checkup_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("checkup_id", checkup_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (checkup_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("checkup_id", checkup_id).select().single();

export const remove = (checkup_id) =>
  supabaseAdmin.from(TABLE).delete().eq("checkup_id", checkup_id);
