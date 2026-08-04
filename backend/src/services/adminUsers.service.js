import { supabase, supabaseAdmin } from "../config/supabase.js";

// Role profile tables. The role-table primary key doubles as the login "school ID".
const ROLE_SOURCES = [
  { table: "student",       role: "student",       pk: "student_id"   },
  { table: "teacher",       role: "teacher",       pk: "teacher_id"   },
  { table: "principal",     role: "principal",     pk: "principal_id" },
  { table: "administrator", role: "administrator", pk: "admin_id"     },
];

// Roles that can be created from the admin User Management screen.
// Students are created through Enrollment (extra required data), so excluded here.
const STAFF_PROFILE = {
  teacher:       { table: "teacher",       pk: "teacher_id"   },
  principal:     { table: "principal",     pk: "principal_id" },
  administrator: { table: "administrator", pk: "admin_id"     },
};

const ADMIN_ID_MIN = 101;
const ADMIN_ID_MAX = 149;
const DEFAULT_PAGE_SIZE = 10;

// last_sign_in_at lives in auth.users (not exposed via PostgREST) — read it through
// the Auth admin API and key it by auth_id. Degrades to {} if Auth is unreachable.
const fetchLastLoginMap = async () => {
  const map = {};
  try {
    const perPage = 200;
    for (let page = 1; page <= 25; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      const users = data?.users ?? [];
      if (error || users.length === 0) break;
      for (const u of users) map[u.id] = u.last_sign_in_at ?? null;
      if (users.length < perPage) break;
    }
  } catch {
    // leave map empty — last_login will show as null
  }
  return map;
};

// Build a unified user list. `users` is the source of truth for role/email/status;
// names + the login "school ID" come from the role tables, joined in JS by user_id
// (no PostgREST embeds, so we don't depend on FK relationships being declared).
const collectUsers = async () => {
  // fetch users + all four role tables in parallel (one query each)
  const [{ data: userRows }, ...profileResults] = await Promise.all([
    supabaseAdmin.from("users").select("user_id, auth_id, email, role, is_active, created_at"),
    ...ROLE_SOURCES.map(({ table, pk }) =>
      supabaseAdmin.from(table).select(`${pk}, first_name, last_name, user_id`)
    ),
  ]);

  // index every profile row by user_id -> { first_name, last_name, school_id }
  const profileByUserId = new Map();
  profileResults.forEach(({ data }, idx) => {
    const { pk } = ROLE_SOURCES[idx];                 // profileResults line up with ROLE_SOURCES order
    (data ?? []).forEach((row) => {
      if (row.user_id == null) return;               // skip profile rows not linked to a user
      profileByUserId.set(row.user_id, {
        first_name: row.first_name ?? "",
        last_name:  row.last_name ?? "",
        school_id:  row[pk] ?? null,                 // the role-table PK is the login "school ID"
      });
    });
  });

  // merge: users row (role/email/status) + its profile (name/school_id)
  return (userRows ?? []).map((u) => {
    const p = profileByUserId.get(u.user_id) ?? {};
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    return {
      user_id:    u.user_id,
      school_id:  p.school_id ?? u.user_id,
      first_name: p.first_name ?? "",
      last_name:  p.last_name ?? "",
      name:       name || u.email || "—",
      role:       u.role,
      email:      u.email ?? "",
      is_active:  !!u.is_active,
      created_at: u.created_at ?? null,
      auth_id:    u.auth_id,
    };
  });
};

// list users with stats + filters + pagination (User Management page)
export const listUsers = async ({
  search = "",
  role   = "all",
  status = "all",
  page   = 1,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) => {
  // merged user list + last-login map, fetched in parallel
  const [all, lastLoginMap] = await Promise.all([collectUsers(), fetchLastLoginMap()]);

  all.forEach((u) => { u.last_login = lastLoginMap[u.auth_id] ?? null; }); // stitch last_login onto each user

  // Stats are computed over the FULL set, before any filtering.
  const stats = {
    totalUsers:     all.length,
    activeUsers:    all.filter((u) => u.is_active).length,
    inactiveUsers:  all.filter((u) => !u.is_active).length,
    administrators: all.filter((u) => u.role === "administrator").length,
    teachers:       all.filter((u) => u.role === "teacher").length,
    students:       all.filter((u) => u.role === "student").length,
    principals:     all.filter((u) => u.role === "principal").length,
  };

  // apply role + status filters
  let filtered = all;
  if (role !== "all")   filtered = filtered.filter((u) => u.role === role);
  if (status !== "all") filtered = filtered.filter((u) => (status === "active" ? u.is_active : !u.is_active));

  // free-text search across name / email / role / school ID
  const q = String(search).trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      String(u.school_id).includes(q)
    );
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name)); // alphabetical by name

  // paginate the filtered set in JS (clamped so page is always in range)
  const total      = filtered.length;
  const size       = Math.max(1, parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage   = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start      = (safePage - 1) * size;

  // strip auth_id from the wire response
  const rows = filtered.slice(start, start + size).map(({ auth_id, ...rest }) => rest);

  return { users: rows, stats, total, totalPages, page: safePage, pageSize: size };
};

// ── Role permissions (User Permissions tab) ──────────────────────────────────
// No permissions table — status is derived from users.is_active. The mockup's
// "Supervisor" row represents classroom (teacher) access.
const PERMISSION_ROLE_MAP = {
  administrator: "administrator",
  principal:     "principal",
  supervisor:    "teacher",
  student:       "student",
};

export const listRolePermissions = async () => {
  const { data: rows, error } = await supabaseAdmin.from("users").select("role, is_active");
  if (error) throw new Error(error.message);
  const users = rows ?? [];

  return Object.entries(PERMISSION_ROLE_MAP).map(([key, dbRole]) => {
    const ofRole = users.filter((u) => u.role === dbRole);
    const active = ofRole.filter((u) => u.is_active).length;
    return { key, role: dbRole, userCount: ofRole.length, activeCount: active, is_active: active > 0 };
  });
};

// Bulk activate/deactivate every user of a role.
// bulk activate/deactivate every user of a role (User Permissions)
export const setRoleActive = async (key, is_active) => {
  const dbRole = PERMISSION_ROLE_MAP[key];             // map UI key -> DB role name
  if (!dbRole) throw new Error(`Unknown role "${key}".`);

  // one UPDATE across every user of that role; `count` = how many rows changed
  const { error, count } = await supabaseAdmin
    .from("users")
    .update({ is_active: !!is_active }, { count: "exact" })
    .eq("role", dbRole);
  if (error) throw new Error(error.message);

  return { key, role: dbRole, is_active: !!is_active, affected: count ?? 0 };
};

// activate/deactivate one user
export const setUserActive = async (user_id, is_active) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_active })                             // flip the flag
    .eq("user_id", user_id)
    .select("user_id, is_active")                      // return the updated row
    .single();
  if (error) throw new Error(error.message);
  return data;
};

// Update an existing user's profile (name), account (email/status) and optionally
// reset their password. Role changes are intentionally NOT supported here — that
// would require migrating the profile across role tables and reassigning the login
// ID, so it's done by deactivating + recreating instead.
// edit a user (name / email / active / password)
export const updateUser = async (user_id, { full_name, email, is_active, password } = {}) => {
  const { data: userRow, error } = await supabaseAdmin
    .from("users")
    .select("user_id, auth_id, email, role")
    .eq("user_id", user_id)
    .single();
  if (error || !userRow) throw new Error("User not found.");

  // Name → role profile table
  if (full_name != null) {
    const trimmed = String(full_name).trim();
    if (!trimmed) throw new Error("Full name is required.");
    const src = ROLE_SOURCES.find((s) => s.role === userRow.role);
    if (src) {
      const parts = trimmed.split(/\s+/);
      const first_name = parts.shift() ?? "";
      const last_name  = parts.join(" ");
      const { error: pErr } = await supabaseAdmin
        .from(src.table).update({ first_name, last_name }).eq("user_id", user_id);
      if (pErr) throw new Error(pErr.message);
    }
  }

  // Email → Supabase Auth + users table
  if (email && email !== userRow.email) {
    if (userRow.auth_id) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, {
        email,
        email_confirm: true,
      });
      if (aErr) throw new Error(aErr.message);
    }
    const { error: uErr } = await supabaseAdmin.from("users").update({ email }).eq("user_id", user_id);
    if (uErr) throw new Error(uErr.message);
  }

  // Account status
  if (typeof is_active === "boolean") {
    const { error: sErr } = await supabaseAdmin.from("users").update({ is_active }).eq("user_id", user_id);
    if (sErr) throw new Error(sErr.message);
  }

  // Optional password reset
  if (password) {
    if (String(password).length < 6) throw new Error("Password must be at least 6 characters.");
    if (!userRow.auth_id) throw new Error("Cannot reset password: no linked auth account.");
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, { password });
    if (pwErr) throw new Error(pwErr.message);
  }

  return { user_id };
};

// Poll until the handle_new_user trigger has created the public.users row.
const waitForUserRow = async (auth_id, tries = 8, delayMs = 250) => {
  for (let i = 0; i < tries; i++) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("auth_id", auth_id)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
};

// create a teacher/principal/administrator user (auto-assigns the role-table id)
export const createUser = async ({
  role,
  first_name,
  last_name,
  email,
  username,
  password,
  contact_number = null,
  is_active = true,
}) => {
  // only staff roles can be created here; students go through Enrollment
  if (!STAFF_PROFILE[role]) {
    throw new Error(`Cannot create role "${role}" here. Students are added through Enrollment.`);
  }
  if (!first_name || !last_name || !email || !password) {
    throw new Error("First name, last name, email and password are required.");
  }

  // Reserve an administrator ID up front so we can fail before creating an auth user.
  let admin_id = null;
  if (role === "administrator") {
    const { data: admins } = await supabaseAdmin.from("administrator").select("admin_id");
    const used = new Set((admins ?? []).map((a) => a.admin_id)); // IDs already taken
    for (let i = ADMIN_ID_MIN; i <= ADMIN_ID_MAX; i++) {          // pick the first free one in range
      if (!used.has(i)) { admin_id = i; break; }
    }
    if (admin_id == null) {
      throw new Error(`No administrator IDs available (range ${ADMIN_ID_MIN}–${ADMIN_ID_MAX} is full).`);
    }
  }

  // Create the Supabase Auth user UNCONFIRMED (this fires the handle_new_user trigger).
  // email_confirm:false keeps the account unverified so that — with "Confirm email" ON in
  // the Supabase dashboard — sign-in is blocked until the user clicks the activation link.
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { username: username || email.split("@")[0], role },
  });
  if (authErr) throw new Error(authErr.message);
  const authId = authData.user.id;

  // if anything below fails, delete the auth user so we don't leave an orphan
  const rollback = async (message) => {
    await supabaseAdmin.auth.admin.deleteUser(authId);
    throw new Error(message);
  };

  // wait for the trigger to create the matching public.users row
  const user_id = await waitForUserRow(authId);
  if (!user_id) await rollback("User profile was not created by the trigger. Please try again.");

  // Send the activation email (Supabase-native: dashboard SMTP + the "Confirm signup"
  // template). Sent before the profile insert so a send failure rolls back cleanly and the
  // admin can retry rather than leaving an un-activatable account behind.
  const activationRedirect = `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`;
  const { error: mailErr } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: activationRedirect },
  });
  if (mailErr) await rollback(`Account not created — activation email could not be sent: ${mailErr.message}`);

  // insert the role-profile row (admin gets the reserved admin_id; others store contact_number)
  const { table, pk } = STAFF_PROFILE[role];
  const profile = { user_id, first_name, last_name };
  if (role === "administrator") profile.admin_id = admin_id;
  else profile.contact_number = contact_number;

  const { error: profErr } = await supabaseAdmin.from(table).insert(profile);
  if (profErr) await rollback(profErr.message);

  // Trigger creates the users row as active; flip it if the admin chose Inactive.
  if (is_active === false) {
    await supabaseAdmin.from("users").update({ is_active: false }).eq("user_id", user_id);
  }

  // resolve the login "school ID": admin already has it; others get the DB-generated PK
  let school_id = admin_id;
  if (role !== "administrator") {
    const { data: created } = await supabaseAdmin
      .from(table)
      .select(pk)
      .eq("user_id", user_id)
      .single();
    school_id = created?.[pk] ?? null;
  }

  return { user_id, school_id, role, email, first_name, last_name };
};
