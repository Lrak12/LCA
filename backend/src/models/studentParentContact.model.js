import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "student_parent_contact";

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const findByStudentId = (student_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("student_id", student_id).order("contact_id", { ascending: true });

export const update = (contact_id, student_id, payload) =>
  supabaseAdmin
    .from(TABLE)
    .update(payload)
    .eq("contact_id", contact_id)
    .eq("student_id", student_id)
    .select()
    .single();
