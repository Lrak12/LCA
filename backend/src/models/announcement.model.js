import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "announcement";

export const findAll = (role) => {
  const query = supabaseAdmin
    .from(TABLE)
    .select("*, principal(first_name, last_name)")
    .order("posted_date", { ascending: false });

  if (role === "administrator" || role === "principal") return query;

  const audienceRole = role ? role.charAt(0).toUpperCase() + role.slice(1) : "All";
  return query
    .eq("is_active", true)
    .or(`audience_role.eq.All,audience_role.eq.${audienceRole}`);
};

export const findById = (ann_id) =>
  supabaseAdmin
    .from(TABLE)
    .select("*, principal(first_name, last_name)")
    .eq("ann_id", ann_id)
    .single();

export const create = (payload) =>
  supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select("*, principal(first_name, last_name)")
    .single();

export const update = (ann_id, principal_id, payload) =>
  supabaseAdmin
    .from(TABLE)
    .update(payload)
    .eq("ann_id", ann_id)
    .eq("principal_id", principal_id)
    .select("*, principal(first_name, last_name)")
    .single();

export const remove = (ann_id) =>
  supabaseAdmin
    .from(TABLE)
    .delete()
    .eq("ann_id", ann_id);
