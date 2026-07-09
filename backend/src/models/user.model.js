import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "users";

export const findAll = () =>
  supabaseAdmin.from(TABLE).select("user_id, auth_id, username, email, role, is_active, created_at");

export const findById = (user_id) =>
  supabaseAdmin.from(TABLE).select("user_id, auth_id, username, email, role, is_active, created_at").eq("user_id", user_id).single();

export const findByAuthId = (auth_id) =>
  supabaseAdmin.from(TABLE).select("user_id, auth_id, username, email, role, is_active, created_at").eq("auth_id", auth_id).single();

export const findByEmail = (email) =>
  supabaseAdmin.from(TABLE).select("user_id, auth_id, username, email, role, is_active, created_at").eq("email", email).single();

export const update = (user_id, payload) =>
  supabaseAdmin.from(TABLE).update(payload).eq("user_id", user_id).select().single();

export const deactivate = (user_id) =>
  supabaseAdmin.from(TABLE).update({ is_active: false }).eq("user_id", user_id).select().single();
