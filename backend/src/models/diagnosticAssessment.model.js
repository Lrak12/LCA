import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "diagnostic_assessment";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), school_year(year_label)");

export const findById = (diag_id) =>
  supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), school_year(year_label)").eq("diag_id", diag_id).single();

export const findByStudent = (student_id) =>
  supabaseAdmin.from(TABLE).select("*, school_year(year_label)").eq("student_id", student_id);

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (diag_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("diag_id", diag_id).select().single();
