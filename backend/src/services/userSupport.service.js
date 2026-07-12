import { supabaseAdmin } from "../config/supabase.js";
import { findUserBySchoolId } from "./auth.service.js";
import * as NotificationService from "./notification.service.js";

const TABLE = "user_support_request";

const ROLE_TABLES = [
  { table: "student",       pk: "student_id"   },
  { table: "teacher",       pk: "teacher_id"   },
  { table: "principal",     pk: "principal_id" },
  { table: "administrator", pk: "admin_id"     },
];

const ticketId = (id) => `SR-${String(id ?? 0).padStart(3, "0")}`;
const preview  = (text, n = 48) => {
  if (!text) return "—";
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

// Build sender_user_id -> { name, first_name, last_name, role, email, school_id }
// so a request row can show who sent it.
const buildUserMap = async () => {
  // users (role/email) + all four role tables (names + school IDs) in parallel
  const [{ data: users }, ...roleResults] = await Promise.all([
    supabaseAdmin.from("users").select("user_id, username, role, email"),
    ...ROLE_TABLES.map(({ table, pk }) => supabaseAdmin.from(table).select(`user_id, first_name, last_name, ${pk}`)),
  ]);

  // index profile info by user_id across the role tables
  const infoByUserId = new Map();
  roleResults.forEach(({ data }, idx) => {
    const { pk } = ROLE_TABLES[idx];                 // results line up with ROLE_TABLES order
    (data ?? []).forEach((row) => {
      if (row.user_id == null) return;               // skip rows not linked to a user
      infoByUserId.set(row.user_id, {
        first_name: row.first_name ?? "",
        last_name:  row.last_name ?? "",
        school_id:  row[pk] ?? null,                 // role-table PK = login "school ID"
      });
    });
  });

  // merge each users row with its profile info
  const map = new Map();
  (users ?? []).forEach((u) => {
    const info = infoByUserId.get(u.user_id) ?? {};
    const name = `${info.first_name ?? ""} ${info.last_name ?? ""}`.trim();
    map.set(u.user_id, {
      name:       name || u.username || `User #${u.user_id}`,
      first_name: info.first_name ?? "",
      last_name:  info.last_name ?? "",
      role:       u.role ?? null,
      email:      u.email ?? "",
      school_id:  info.school_id ?? null,
    });
  });
  return map;
};

const mapRow = (userMap) => (r) => {
  const u = userMap.get(r.sender_user_id) ?? { name: r.sender_user_id ? `User #${r.sender_user_id}` : "Unknown", role: null };
  return {
    sr_id:          r.sr_id,
    ticketId:       ticketId(r.sr_id),
    sender_user_id: r.sender_user_id,
    userName:       u.name,
    school_id:      u.school_id ?? null,
    role:           u.role,
    category:       r.category,
    password_reset: !!r.password_reset || r.category === "Password Reset",
    subject:        preview(r.message_content),     // no subject column — preview the message
    message:        r.message_content,
    response:       r.response,
    status:         r.status,
    sent_date:      r.sent_date,
    response_date:  r.response_date,
  };
};

// support requests for the admin User Support page (+ stats + filters)
export const listSupportRequests = async ({
  search = "",
  category = "all",
  status = "all",
  page = 1,
  pageSize = 8,
} = {}) => {
  // all requests (newest first) + the user lookup map, in parallel
  const [{ data: rows }, userMap] = await Promise.all([
    supabaseAdmin.from(TABLE).select("*").order("sent_date", { ascending: false }),
    buildUserMap(),
  ]);

  let reqs = (rows ?? []).map(mapRow(userMap));       // shape each row for the UI

  // stat-card counts, over the FULL (unfiltered) set
  const stats = {
    total:         reqs.length,
    passwordReset: reqs.filter((r) => r.password_reset).length,
    open:          reqs.filter((r) => r.status === "Open").length,
    inProgress:    reqs.filter((r) => r.status === "In Progress").length,
    resolved:      reqs.filter((r) => r.status === "Resolved").length,
  };

  // dropdown options derived from the data so they always match real values
  const filters = {
    categories: [...new Set(reqs.map((r) => r.category).filter(Boolean))].sort(),
    statuses:   [...new Set(reqs.map((r) => r.status).filter(Boolean))].sort(),
  };

  // apply category + status filters
  if (category !== "all") reqs = reqs.filter((r) => r.category === category);
  if (status !== "all")   reqs = reqs.filter((r) => r.status === status);

  // free-text search across name / role / subject / category / ticket ID
  const q = String(search).trim().toLowerCase();
  if (q) {
    reqs = reqs.filter((r) =>
      (r.userName ?? "").toLowerCase().includes(q) ||
      (r.role ?? "").toLowerCase().includes(q) ||
      (r.subject ?? "").toLowerCase().includes(q) ||
      (r.category ?? "").toLowerCase().includes(q) ||
      r.ticketId.toLowerCase().includes(q)
    );
  }

  // paginate the filtered set (clamped page)
  const total      = reqs.length;
  const size       = Math.max(1, parseInt(pageSize, 10) || 8);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage   = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start      = (safePage - 1) * size;

  return { requests: reqs.slice(start, start + size), stats, total, totalPages, page: safePage, pageSize: size, filters };
};

// ── Forgot Password (public) ──────────────────────────────────────────────────
// The user enters only their ID number. We validate the account, then auto-create
// (or reuse) a password-reset support request for an administrator to process.

const buildResetMessage = (profile, school_id) =>
  `Password reset requested via the login page (Forgot Password) for ` +
  `${`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "this user"} ` +
  `(ID ${school_id}, role: ${profile.role}). The user could not access their account ` +
  `and is requesting administrator assistance.`;

// Notify admins/principals of a new reset request. The `notification` table is
// shared by announcements + support messages (one row per recipient user).
// Columns: notification_id (auto), user_id, title, message_content,
// created_date (default CURRENT_DATE), is_read (default false).
// Wrapped non-fatally by the caller so a notification failure never blocks the
// reset request (e.g. before the DB grants are applied).
const notifyAdminsOfPasswordReset = async (profile, row) => {
  const { data: admins } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .in("role", ["administrator", "principal"]);
  if (!admins?.length) return;

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "A user";
  const rows = admins.map((a) => ({
    user_id:         a.user_id,
    title:           "New Password Reset Request",
    message_content: `${fullName} requested a password reset (${ticketId(row.sr_id)}).`,
    is_read:         false,
  }));

  const { error } = await supabaseAdmin.from("notification").insert(rows);
  if (error) throw new Error(error.message);
};

export const requestPasswordReset = async (school_id) => {
  const profile = await findUserBySchoolId(school_id);
  if (!profile) throw new Error("No account found for that ID number.");
  if (!profile.is_active) throw new Error("This account is inactive. Please contact your administrator.");

  // Reuse an existing pending request instead of creating duplicates
  const { data: existing } = await supabaseAdmin
    .from(TABLE)
    .select("sr_id, status")
    .eq("sender_user_id", profile.user_id)
    .eq("password_reset", true)
    .in("status", ["Open", "In Progress"])
    .order("sent_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row;
  if (existing) {
    // Resurface it for the admin by bumping the submission date
    const { data } = await supabaseAdmin
      .from(TABLE)
      .update({ sent_date: new Date().toISOString() })
      .eq("sr_id", existing.sr_id)
      .select()
      .single();
    row = data ?? existing;
  } else {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        sender_user_id:  profile.user_id,
        category:        "Password Reset",
        message_content: buildResetMessage(profile, school_id),
        password_reset:  true,
        status:          "Open",
        sent_date:       new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    row = data;
  }

  // Non-fatal: a notification failure must not break the reset request
  await notifyAdminsOfPasswordReset(profile, row).catch((e) =>
    console.warn("[forgot-password] notification skipped:", e.message)
  );

  return { ticketId: ticketId(row.sr_id), reused: !!existing };
};

// ── Contact Administrator (public) ────────────────────────────────────────────
// Public-facing reference shown to the requester (mockup format SUP-YYYY-NNNN).
const publicTicketId = (id, date) => {
  const year = date ? new Date(date).getFullYear() : new Date().getFullYear();
  return `SUP-${year}-${String(id ?? 0).padStart(4, "0")}`;
};

// The signed-in user's own support requests (for the Contact Administrator history).
export const listRequestsForUser = async (user_id) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("sender_user_id", user_id)
    .order("sent_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    sr_id:         r.sr_id,
    ticketId:      publicTicketId(r.sr_id, r.sent_date),
    category:      r.category,
    message:       r.message_content,
    status:        r.status,
    response:      r.response,
    sent_date:     r.sent_date,
    response_date: r.response_date,
  }));
};

// A signed-in user submits a support request (tied directly to their user_id).
// The user_support_request.category column has a CHECK constraint that only
// allows these values. Any other reason is stored as "Other" with the real
// reason preserved at the start of the message, so a submit can never 500.
const ALLOWED_CATEGORIES = new Set(["Technical Issue", "Password Reset", "Other"]);

export const createRequestForUser = async (user_id, { reason, message, full_name } = {}) => {
  if (!reason || !String(reason).trim())   throw new Error("Please select a reason for contact.");
  if (!message || !String(message).trim()) throw new Error("Please enter a message.");

  const rawReason = String(reason).trim();
  const category  = ALLOWED_CATEGORIES.has(rawReason) ? rawReason : "Other";
  const body      = category === rawReason
    ? String(message).trim()
    : `[${rawReason}] ${String(message).trim()}`;

  const { data: row, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      sender_user_id:  user_id,
      category,
      message_content: body,
      password_reset:  false,
      status:          "Open",
      sent_date:       new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { data: admins } = await supabaseAdmin
    .from("users").select("user_id").eq("role", "administrator");
  await NotificationService.createForUsers((admins ?? []).map((a) => a.user_id), {
    title:           "New Support Request",
    message_content: `${full_name || "A user"}: ${String(reason).trim()} (${publicTicketId(row.sr_id, row.sent_date)})`,
  }).catch((e) => console.warn("[support] notification skipped:", e.message));

  return { ticketId: publicTicketId(row.sr_id, row.sent_date) };
};

// A logged-out user submits a support request: name + ID + reason + message.
// Stored in the same table as forgot-password (password_reset = false).
export const createContactRequest = async ({ id_number, full_name, reason, message }) => {
  if (!reason || !String(reason).trim()) throw new Error("Please select a reason for contact.");
  if (!message || !String(message).trim()) throw new Error("Please enter a message.");

  const profile = await findUserBySchoolId(id_number);
  if (!profile) throw new Error("No account found for that ID number.");

  const { data: row, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      sender_user_id:  profile.user_id,
      category:        String(reason).trim(),
      message_content: String(message).trim(),
      password_reset:  false,
      status:          "Open",
      sent_date:       new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Notify admins/principals (non-fatal until notification grants are applied)
  const { data: admins } = await supabaseAdmin
    .from("users").select("user_id").in("role", ["administrator", "principal"]);
  const name = String(full_name ?? "").trim()
    || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    || "A user";
  await NotificationService.createForUsers((admins ?? []).map((a) => a.user_id), {
    title:           "New Support Request",
    message_content: `${name}: ${String(reason).trim()} (${ticketId(row.sr_id)})`,
  }).catch((e) => console.warn("[contact-admin] notification skipped:", e.message));

  return { ticketId: ticketId(row.sr_id) };
};

// "Send Password Reset Link" — marks the ticket handled. The actual reset happens
// when the user opens the reset page and enters their ID number + new password.
export const sendPasswordResetLink = async (sr_id) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status:        "Resolved",
      response:      "Password reset link sent to registered email.",
      response_date: new Date().toISOString(),
    })
    .eq("sr_id", sr_id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

// Admin updates a request's status and/or writes a response. When a written
// response is provided, the requesting user is notified with it (response can be
// null — a status-only change does not notify).
// save an admin response + status on a support request
export const respondToRequest = async (sr_id, { response, status } = {}) => {
  const { data: reqRow, error: findErr } = await supabaseAdmin
    .from(TABLE).select("sr_id, sender_user_id").eq("sr_id", sr_id).single();
  if (findErr || !reqRow) throw new Error("Request not found.");

  const trimmed = String(response ?? "").trim();
  const update = {};
  if (status) update.status = status;
  if (trimmed) {
    update.response = trimmed;
    update.response_date = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return reqRow; // nothing to change

  const { data, error } = await supabaseAdmin
    .from(TABLE).update(update).eq("sr_id", sr_id).select().single();
  if (error) throw new Error(error.message);

  // Notify the user only when there's a written response (non-fatal)
  if (trimmed) {
    await NotificationService.createForUsers([reqRow.sender_user_id], {
      title:           `Response to your request ${ticketId(sr_id)}`,
      message_content: trimmed,
    }).catch((e) => console.warn("[support-response] notification skipped:", e.message));
  }

  return data;
};

// ── User Password Resets view (password_reset = true) ────────────────────────
const REQUEST_SOURCE = "Web (Forgot Password)";

const requestId = (id, iso) => {
  const year = iso ? new Date(iso).getFullYear() : new Date().getFullYear();
  return `PR-${year}-${String(id ?? 0).padStart(5, "0")}`;
};

// pending forgot-password requests (admin User Password Resets page)
export const listPasswordResetRequests = async ({ search = "", status = "all", page = 1, pageSize = 8 } = {}) => {
  // only password_reset rows (newest first) + the user lookup map, in parallel
  const [{ data: rows }, userMap] = await Promise.all([
    supabaseAdmin.from(TABLE).select("*").eq("password_reset", true).order("sent_date", { ascending: false }),
    buildUserMap(),
  ]);

  // shape each row; name shown "Last, First" (falls back to the joined display name)
  let reqs = (rows ?? []).map((r) => {
    const u = userMap.get(r.sender_user_id) ?? {};
    const display = (u.last_name || u.first_name)
      ? `${u.last_name ?? ""}, ${u.first_name ?? ""}`.replace(/(^, )|(, $)/g, "").trim() // trim stray comma if a name part is missing
      : (u.name ?? "Unknown");
    return {
      sr_id:         r.sr_id,
      requestId:     requestId(r.sr_id, r.sent_date),
      name:          display,
      school_id:     u.school_id,
      role:          u.role,
      email:         u.email,
      requested_at:  r.sent_date,
      status:        r.status,
      requestSource: REQUEST_SOURCE,
      message:       r.message_content,
      note:          r.response,
    };
  });

  const statuses = [...new Set(reqs.map((r) => r.status).filter(Boolean))].sort(); // status filter options from the data

  // apply status filter (case-insensitive)
  if (status !== "all") reqs = reqs.filter((r) => (r.status ?? "").toLowerCase() === String(status).toLowerCase());

  // free-text search across name / email / school ID / request ID
  const q = String(search).trim().toLowerCase();
  if (q) {
    reqs = reqs.filter((r) =>
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      String(r.school_id ?? "").includes(q) ||
      r.requestId.toLowerCase().includes(q)
    );
  }

  // paginate the filtered set (clamped page)
  const total      = reqs.length;
  const size       = Math.max(1, parseInt(pageSize, 10) || 8);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage   = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start      = (safePage - 1) * size;

  return { requests: reqs.slice(start, start + size), total, totalPages, page: safePage, pageSize: size, statuses };
};

const genTempPassword = () => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums  = "23456789";
  const spec  = "!@#$%&";
  const all   = upper + lower + nums + spec;
  const pick  = (s) => s[Math.floor(Math.random() * s.length)];
  let chars = [pick(upper), pick(lower), pick(nums), pick(spec)];
  for (let i = 0; i < 6; i++) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join("");
};

const markResolved = async (sr_id, responseText) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ status: "Resolved", response: responseText, response_date: new Date().toISOString() })
    .eq("sr_id", sr_id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

// action: "temp" | "link" | "resolve"
// approve/decline a password-reset request (approve sends the reset link)
export const processPasswordReset = async (sr_id, action, note = "") => {
  const trimmed = String(note ?? "").trim();

  if (action === "temp") {
    const { data: reqRow } = await supabaseAdmin
      .from(TABLE).select("sr_id, sender_user_id").eq("sr_id", sr_id).single();
    if (!reqRow) throw new Error("Request not found.");

    const { data: userRow } = await supabaseAdmin
      .from("users").select("auth_id, email").eq("user_id", reqRow.sender_user_id).single();
    if (!userRow?.auth_id) throw new Error("User account not found.");

    const tempPassword = genTempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userRow.auth_id, { password: tempPassword });
    if (error) throw new Error(error.message);

    const request = await markResolved(sr_id, trimmed || "Temporary password sent to registered email.");
    return { request, tempPassword, email: userRow.email };
  }

  if (action === "link") {
    const request = await markResolved(sr_id, trimmed || "Password reset link sent to registered email.");
    return { request };
  }

  // resolve (quick action)
  const request = await markResolved(sr_id, trimmed || "Marked resolved.");
  return { request };
};
