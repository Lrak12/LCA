import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "administrator";

export const findByUserId = (user_id) =>
  supabaseAdmin.from(TABLE).select("admin_id, first_name, last_name").eq("user_id", user_id).single();
