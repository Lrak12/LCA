import { supabase, supabaseAdmin } from "../config/supabase.js";

// Account settings for the signed-in user. The display name lives on the role's
// profile table (`principal` and `teacher` have contact_number too; `administrator`
// does not); email/password live on Supabase Auth + `users`.
const PROFILE = {
  principal:     { table: "principal",     pk: "principal_id", hasContact: true  },
  teacher:       { table: "teacher",       pk: "teacher_id",   hasContact: true  },
  administrator: { table: "administrator", pk: "admin_id",     hasContact: false },
  student:       { table: "student",       pk: "student_id",   hasContact: true  },
};
const profileFor = (role) => PROFILE[role] ?? PROFILE.administrator;

export const getAccount = async (user_id) => {
  const { data: userRow } = await supabaseAdmin
    .from("users").select("user_id, email, username, role").eq("user_id", user_id).single();

  const { table, pk: pkCol, hasContact } = profileFor(userRow?.role);
  const cols  = hasContact ? `${pkCol}, first_name, last_name, contact_number` : `${pkCol}, first_name, last_name`;
  const { data: profile } = await supabaseAdmin.from(table).select(cols).eq("user_id", user_id).maybeSingle();

  return {
    user_id,
    id_number:      profile?.[pkCol] ?? "",   // the login ID (role table PK)
    first_name:     profile?.first_name ?? "",
    last_name:      profile?.last_name ?? "",
    contact_number: profile?.contact_number ?? "",
    email:          userRow?.email ?? "",
    username:       userRow?.username ?? "",
    role:           userRow?.role ?? "administrator",
  };
};

export const updateAccount = async (user_id, { first_name, last_name, contact_number, email }) => {
  const { data: userRow } = await supabaseAdmin
    .from("users").select("auth_id, email, role").eq("user_id", user_id).single();
  const { table, hasContact } = profileFor(userRow?.role);

  const fields = {};
  if (first_name !== undefined) fields.first_name = first_name;
  if (last_name  !== undefined) fields.last_name  = last_name;
  if (contact_number !== undefined && hasContact) fields.contact_number = contact_number;
  if (Object.keys(fields).length) {
    const { error } = await supabaseAdmin.from(table).update(fields).eq("user_id", user_id);
    if (error) throw new Error(error.message);
  }

  if (email && userRow && email !== userRow.email) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
      email, email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);
    await supabaseAdmin.from("users").update({ email }).eq("user_id", user_id);
  }

  return getAccount(user_id);
};

export const changePassword = async (user_id, { current_password, new_password }) => {
  if (!new_password || String(new_password).length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const { data: userRow } = await supabaseAdmin
    .from("users").select("auth_id, email").eq("user_id", user_id).single();
  if (!userRow?.auth_id) throw new Error("Account not found.");

  // Verify the current password by attempting a sign-in.
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: userRow.email, password: current_password,
  });
  if (signErr) throw new Error("Current password is incorrect.");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
    password: new_password,
  });
  if (error) throw new Error(error.message);

  return { ok: true };
};
