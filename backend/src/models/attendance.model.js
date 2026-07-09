import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "attendance";

export const findAll = (filters = {}) => {
  let query = supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), teacher(first_name, last_name)");
  if (filters.student_id) query = query.eq("student_id", filters.student_id);
  if (filters.teacher_id) query = query.eq("teacher_id", filters.teacher_id);
  if (filters.date)       query = query.eq("date_recorded", filters.date);
  return query.order("date_recorded", { ascending: false });
};

export const findById = (att_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("att_id", att_id).single();

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (att_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("att_id", att_id).select().single();

export const remove = (att_id) =>
  supabaseAdmin.from(TABLE).delete().eq("att_id", att_id);
