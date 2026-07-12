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

// role-agnostic account read (admin/teacher/student account pages)
export const getAccount = async (user_id) => {
  // account record holds role/email/username
  const { data: userRow } = await supabaseAdmin
    .from("users").select("user_id, email, username, role").eq("user_id", user_id).single();

  // pick the right profile table for this role; only some tables have contact_number
  const { table, pk: pkCol, hasContact } = profileFor(userRow?.role);
  const cols  = hasContact ? `${pkCol}, first_name, last_name, contact_number` : `${pkCol}, first_name, last_name`;
  const { data: profile } = await supabaseAdmin.from(table).select(cols).eq("user_id", user_id).maybeSingle();

  // combine users + profile into one flat shape for the page
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

// update profile fields + email
export const updateAccount = async (user_id, { first_name, last_name, contact_number, email }) => {
  const { data: userRow } = await supabaseAdmin
    .from("users").select("auth_id, email, role").eq("user_id", user_id).single();
  const { table, hasContact } = profileFor(userRow?.role);

  // build a patch of only the provided profile fields (contact_number only if the table has it)
  const fields = {};
  if (first_name !== undefined) fields.first_name = first_name;
  if (last_name  !== undefined) fields.last_name  = last_name;
  if (contact_number !== undefined && hasContact) fields.contact_number = contact_number;
  if (Object.keys(fields).length) {                  // skip the write when nothing profile-side changed
    const { error } = await supabaseAdmin.from(table).update(fields).eq("user_id", user_id);
    if (error) throw new Error(error.message);
  }

  // email change goes to Supabase Auth first, then mirror into users
  if (email && userRow && email !== userRow.email) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
      email, email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);
    await supabaseAdmin.from("users").update({ email }).eq("user_id", user_id);
  }

  return getAccount(user_id);                         // return the fresh, combined account
};

// verify the current password, then set the new one
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

  // current password checks out -> set the new one via the Auth admin API
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
    password: new_password,
  });
  if (error) throw new Error(error.message);

  return { ok: true };
};
