import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "principal";

export const findByUserId = (user_id) =>
  supabaseAdmin.from(TABLE).select("principal_id, first_name, last_name").eq("user_id", user_id).maybeSingle();
