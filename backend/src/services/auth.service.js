import { supabase, supabaseAdmin } from "../config/supabase.js";
import { createClient } from "@supabase/supabase-js";

// Role tables searched in priority order — first table containing the ID wins.
// (IDs are seeded into distinct ranges, so collisions shouldn't occur in practice.)
const ROLE_TABLES = [
  { table: "student",       role: "student",       pk: "student_id"   },
  { table: "teacher",       role: "teacher",       pk: "teacher_id"   },
  { table: "principal",     role: "principal",     pk: "principal_id" },
  { table: "administrator", role: "administrator", pk: "admin_id"     },
];

export const findUserBySchoolId = async (school_id) => {
  const id = parseInt(school_id, 10);
  if (isNaN(id) || id <= 0) return null;

  // Look the ID up in all role tables at once; take the first match by priority
  const lookups = await Promise.all(
    ROLE_TABLES.map((config) =>
      supabaseAdmin
        .from(config.table)
        .select(`${config.pk}, user_id, first_name, last_name`)
        .eq(config.pk, id)
        .maybeSingle()
    )
  );

  const matchIndex = lookups.findIndex(({ data }) => data?.user_id);
  if (matchIndex === -1) return null;

  const config  = ROLE_TABLES[matchIndex];
  const profile = lookups[matchIndex].data;

  const { data: userRecord, error: userErr } = await supabaseAdmin
    .from("users")
    .select("user_id, email, is_active, username")
    .eq("user_id", profile.user_id)
    .single();

  if (userErr || !userRecord) return null;

  return {
    email:      userRecord.email,
    is_active:  userRecord.is_active,
    role:       config.role,
    username:   userRecord.username,
    user_id:    userRecord.user_id,
    id_number:  profile[config.pk] ?? null,   // the role-table PK = login / display ID
    first_name: profile.first_name ?? null,
    last_name:  profile.last_name  ?? null,
  };
};

export const login = async (school_id, password) => {
  const profile = await findUserBySchoolId(school_id);

  if (!profile) {
    throw new Error("Invalid ID number or password.");
  }

  if (!profile.is_active) {
    throw new Error("Account is inactive. Please contact your administrator.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    profile.email,
    password,
  });

  if (error) {
    // Newly-created accounts stay unconfirmed until the user clicks the activation link.
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message ?? "")) {
      throw new Error("Please confirm your email address first. Check your inbox for the activation link we sent.");
    }
    throw new Error("Invalid ID number or password.");
  }

  return {
    data,
    role:       profile.role,
    username:   profile.username,
    user_id:    profile.user_id,
    id_number:  profile.id_number,
    first_name: profile.first_name,
    last_name:  profile.last_name,
  };
};

// Custom reset flow: the user proves identity with their ID number (no email token).
export const resetPasswordBySchoolId = async (school_id, new_password) => {
  if (!new_password || String(new_password).length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const profile = await findUserBySchoolId(school_id);
  if (!profile) throw new Error("No account found for that ID number.");

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("auth_id")
    .eq("user_id", profile.user_id)
    .single();
  if (!userRow?.auth_id) throw new Error("No account found for that ID number.");

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
    password: new_password,
  });
  if (error) throw new Error(error.message);

  return { user_id: profile.user_id };
};

// Reset flow via a Supabase recovery link: the recovery access_token (carried in the
// email link's redirect) identifies the user. Validate it, then set the new password.
export const resetPasswordWithToken = async (access_token, new_password) => {
  if (!access_token) throw new Error("Invalid or expired reset link.");
  if (!new_password || String(new_password).length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const { data, error } = await supabaseAdmin.auth.getUser(access_token);
  if (error || !data?.user) throw new Error("Invalid or expired reset link.");

  const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    password: new_password,
  });
  if (upErr) throw new Error(upErr.message);
  return { user_id: data.user.id };
};

export const logout = async (token) => {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message);
};