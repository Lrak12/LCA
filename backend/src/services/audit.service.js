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

// user_id -> { name, role }
const buildUserMap = async () => {
  const [{ data: users }, ...roleResults] = await Promise.all([
    supabaseAdmin.from("users").select("user_id, username, role"),
    ...ROLE_TABLES.map(({ table }) => supabaseAdmin.from(table).select("user_id, first_name, last_name")),
  ]);

  const nameByUserId = new Map();
  roleResults.forEach(({ data }) =>
    (data ?? []).forEach((row) => {
      if (row.user_id == null) return;
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      if (name) nameByUserId.set(row.user_id, name);
    })
  );

  const map = new Map();
  (users ?? []).forEach((u) => {
    map.set(u.user_id, {
      name: nameByUserId.get(u.user_id) || u.username || `User #${u.user_id}`,
      role: u.role ?? null,
    });
  });
  return map;
};

export const listAuditLogs = async ({
  search = "",
  user_id = "all",
  action = "all",
  module: mod = "all",
  from = "",
  to = "",
  page = 1,
  pageSize = 5,
} = {}) => {
  const [{ data: rows }, userMap] = await Promise.all([
    supabaseAdmin.from("system_audit_log").select("*").order("timestamp", { ascending: false }),
    buildUserMap(),
  ]);

  let logs = (rows ?? []).map((r) => {
    const u = userMap.get(r.user_id) ?? { name: r.user_id ? `User #${r.user_id}` : "System", role: null };
    return {
      sal_id:      r.sal_id,
      timestamp:   r.timestamp,
      user_id:     r.user_id,
      userName:    u.name,
      userRole:    u.role,
      action:      r.action,
      module:      r.entity_affected,
      description: r.details,
    };
  });

  // Dropdown options derived from the full (unfiltered) set so they always match real data.
  const filters = {
    users: [...new Map(
      logs.filter((l) => l.user_id != null).map((l) => [l.user_id, { user_id: l.user_id, name: l.userName }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name)),
    actions: [...new Set(logs.map((l) => l.action).filter(Boolean))].sort(),
    modules: [...new Set(logs.map((l) => l.module).filter(Boolean))].sort(),
  };

  if (user_id !== "all") logs = logs.filter((l) => String(l.user_id) === String(user_id));
  if (action !== "all")  logs = logs.filter((l) => l.action === action);
  if (mod !== "all")     logs = logs.filter((l) => l.module === mod);
  if (from) { const f = new Date(from);                         logs = logs.filter((l) => new Date(l.timestamp) >= f); }
  if (to)   { const t = new Date(to); t.setHours(23, 59, 59, 999); logs = logs.filter((l) => new Date(l.timestamp) <= t); }

  const q = String(search).trim().toLowerCase();
  if (q) {
    logs = logs.filter((l) =>
      (l.userName ?? "").toLowerCase().includes(q) ||
      (l.action ?? "").toLowerCase().includes(q) ||
      (l.module ?? "").toLowerCase().includes(q) ||
      (l.description ?? "").toLowerCase().includes(q)
    );
  }

  const total      = logs.length;
  const size       = Math.max(1, parseInt(pageSize, 10) || 5);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage   = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start      = (safePage - 1) * size;

  return { logs: logs.slice(start, start + size), total, totalPages, page: safePage, pageSize: size, filters };
};
