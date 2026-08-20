import { supabaseAdmin } from "../config/supabase.js";

// Small shared helpers for account status that depends on a school year.

export const getSchoolYear = async (sy_id = null) => {
  let query = supabaseAdmin
    .from("school_year")
    .select("sy_id, year_label, start_date, end_date, is_active");

  query = sy_id
    ? query.eq("sy_id", Number(sy_id))
    : query.eq("is_active", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(sy_id ? "School year not found." : "No active school year found.");
  return data;
};

export const getEligibleUserIds = async (sy_id, role = null) => {
  const { data, error } = await supabaseAdmin.rpc("school_year_eligible_users", {
    p_sy_id: Number(sy_id),
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.user_id));
};

// Teachers and students use the database function so their final/return year is
// saved. Other roles keep the old simple active flag behavior.
export const setAccountActive = async (user_id, is_active, changed_by = null, reason = null) => {
  const id = Number(user_id);
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("user_id, role")
    .eq("user_id", id)
    .single();
  if (userErr || !user) throw new Error("User not found.");

  if (["teacher", "student"].includes(user.role)) {
    const { data, error } = await supabaseAdmin.rpc("set_school_year_account_active", {
      p_user_id: id,
      p_is_active: !!is_active,
      p_changed_by: changed_by ? Number(changed_by) : null,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_active: !!is_active })
    .eq("user_id", id)
    .select("user_id, role, is_active")
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const getLatestStatusByUser = async () => {
  const [{ data: rows, error }, { data: years }] = await Promise.all([
    supabaseAdmin
      .from("user_deactivation_history")
      .select("history_id, user_id, deactivated_sy_id, deactivated_at, reactivated_sy_id, reactivated_at")
      .order("deactivated_at", { ascending: false }),
    supabaseAdmin.from("school_year").select("sy_id, year_label"),
  ]);
  if (error) throw new Error(error.message);

  const yearById = new Map((years ?? []).map((year) => [year.sy_id, year.year_label]));
  const result = new Map();
  (rows ?? []).forEach((row) => {
    if (result.has(row.user_id)) return;
    result.set(row.user_id, {
      deactivated_sy_id: row.deactivated_sy_id,
      deactivated_school_year: yearById.get(row.deactivated_sy_id) ?? null,
      deactivated_at: row.deactivated_at,
      reactivated_sy_id: row.reactivated_sy_id,
      reactivated_school_year: yearById.get(row.reactivated_sy_id) ?? null,
      reactivated_at: row.reactivated_at,
    });
  });
  return result;
};
