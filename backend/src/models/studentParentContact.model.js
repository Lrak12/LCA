import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "student_parent_contact";

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const findByStudentId = (student_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("student_id", student_id);
