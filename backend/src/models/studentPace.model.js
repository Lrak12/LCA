import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "student_pace";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), pace_module(module_name, subject, module_number), teacher(first_name, last_name)");

export const findById = (sp_id) =>
  supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), pace_module(module_name, subject), teacher(first_name, last_name)").eq("sp_id", sp_id).single();

export const findByStudent = (student_id) =>
  supabaseAdmin.from(TABLE).select("*, pace_module(module_name, subject, module_number, gl_id)").eq("student_id", student_id).order("assigned_date");

export const findByTeacher = (teacher_id) =>
  supabaseAdmin.from(TABLE).select("*, student(first_name, last_name), pace_module(module_name, subject)").eq("teacher_id", teacher_id);

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (sp_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("sp_id", sp_id).select().single();

export const remove = (sp_id) =>
  supabaseAdmin.from(TABLE).delete().eq("sp_id", sp_id);
