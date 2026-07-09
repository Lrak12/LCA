import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "pace_test_result";

export const findByPace = (sp_id) =>
  supabaseAdmin.from(TABLE).select("*, teacher(first_name, last_name)").eq("pacetest_id", sp_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (sp_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("pacetest_id", sp_id).select().single();

export const findBySpAndQuarter = (sp_id, quarter) =>
  supabaseAdmin
    .from(TABLE)
    .select("pacetest_id")
    .eq("sp_id", sp_id)
    .eq("quarter", quarter)
    .maybeSingle();

export const updateById = (pacetest_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("pacetest_id", pacetest_id);
