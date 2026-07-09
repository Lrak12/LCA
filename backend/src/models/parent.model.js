import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "parent";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active)");

export const findById = (parent_id) =>
  supabaseAdmin.from(TABLE).select("*, users(user_id, username, email, is_active)").eq("parent_id", parent_id).single();

export const findByUserId = (user_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("user_id", user_id).single();

export const findBySchoolId = (school_id) =>
  supabaseAdmin.from(TABLE).select("*").eq("school_id", school_id).single();

export const findLinkedStudents = (parent_id) =>
  supabaseAdmin.from("student_parent").select("*, student(*)").eq("parent_id", parent_id);

export const create = (payload) =>
  supabaseAdmin.from(TABLE).insert(payload).select().single();

export const update = (parent_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("parent_id", parent_id).select().single();