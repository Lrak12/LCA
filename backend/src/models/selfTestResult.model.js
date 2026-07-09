import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "self_test_result";

export const findBySpAndQuarter = (sp_id, quarter) =>
  supabaseAdmin
    .from(TABLE)
    .select("selftest_id")
    .eq("sp_id", sp_id)
    .eq("quarter", quarter)
    .maybeSingle();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const updateById = (selftest_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("selftest_id", selftest_id);
