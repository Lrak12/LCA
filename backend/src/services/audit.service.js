import { supabaseAdmin } from "../config/supabase.js";

const ROLE_TABLES = [
  { table: "student",       pk: "student_id"   },
  { table: "teacher",       pk: "teacher_id"   },
  { table: "principal",     pk: "principal_id" },
  { table: "administrator", pk: "admin_id"     },
];

// Best-effort audit write — never throws into the calling action.
export const writeAudit = async ({ user_id = null, action, entity_affected, entity_id = null, details = null }) => {
  try {
    const { error } = await supabaseAdmin.from("system_audit_log").insert({
      user_id,
      action,
      entity_affected,
      entity_id,
      details,
      timestamp: new Date().toISOString(),
    });
    if (error) console.error("audit write failed:", error.message);
  } catch (err) {
    console.error("audit write threw:", err.message);
  }
};

// Build user_id -> { name, role } so the log can show who did each action.
const buildUserMap = async () => {
  // users (role/username) + all four role tables (names) in parallel
  const [{ data: users }, ...roleResults] = await Promise.all([
    supabaseAdmin.from("users").select("user_id, username, role"),
    ...ROLE_TABLES.map(({ table }) => supabaseAdmin.from(table).select("user_id, first_name, last_name")),
  ]);

  // index full names by user_id across every role table
  const nameByUserId = new Map();
  roleResults.forEach(({ data }) =>
    (data ?? []).forEach((row) => {
      if (row.user_id == null) return;               // skip rows not linked to a user
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      if (name) nameByUserId.set(row.user_id, name);
    })
  );

  // merge: prefer the profile name, fall back to username, then a "User #id" placeholder
  const map = new Map();
  (users ?? []).forEach((u) => {
    map.set(u.user_id, {
      name: nameByUserId.get(u.user_id) || u.username || `User #${u.user_id}`,
      role: u.role ?? null,
    });
  });
  return map;
};

// read system_audit_log with filters + pagination (Audit Logs page)
export const listAuditLogs = async ({
  search = "",
  action = "all",
  from = "",
  to = "",
  page = 1,
  pageSize = 5,
} = {}) => {
  // all log rows (newest first) + the user lookup map, in parallel
  const [{ data: rows }, userMap] = await Promise.all([
    supabaseAdmin.from("system_audit_log").select("*").order("timestamp", { ascending: false }),
    buildUserMap(),
  ]);

  // shape each raw row for the UI, resolving the actor's name/role (null user_id = "System")
  let logs = (rows ?? []).map((r) => {
    const u = userMap.get(r.user_id) ?? { name: r.user_id ? `User #${r.user_id}` : "System", role: null };
    return {
      sal_id:      r.sal_id,
      timestamp:   r.timestamp,
      user_id:     r.user_id,
      userName:    u.name,
      userRole:    u.role,
      action:      r.action,
      module:      r.entity_affected,               // entity_affected column -> "Module" column
      description: r.details,
    };
  });

  // Action options are derived from the full set so they always match real data.
  const filters = {
    actions: [...new Set(logs.map((l) => l.action).filter(Boolean))].sort(),
  };

  // Apply the action and exact timestamp boundaries sent by the browser.
  if (action !== "all")  logs = logs.filter((l) => l.action === action);
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) logs = logs.filter((l) => new Date(l.timestamp) >= start);
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) logs = logs.filter((l) => new Date(l.timestamp) <= end);
  }

  // Search the fields exposed by the search box. IDs remain supported so an
  // administrator can paste a known log/user ID even though the hint stays concise.
  const q = String(search).trim().toLowerCase();
  if (q) {
    logs = logs.filter((l) =>
      (l.userName ?? "").toLowerCase().includes(q) ||
      String(l.sal_id ?? "").toLowerCase().includes(q) ||
      String(l.user_id ?? "").toLowerCase().includes(q) ||
      (l.action ?? "").toLowerCase().includes(q)
    );
  }

  // paginate the filtered set (clamped page)
  const total      = logs.length;
  const size       = Math.max(1, parseInt(pageSize, 10) || 5);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage   = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start      = (safePage - 1) * size;

  return { logs: logs.slice(start, start + size), total, totalPages, page: safePage, pageSize: size, filters };
};
