import { supabaseAdmin } from "../config/supabase.js";

// ── Admin dashboard ───────────────────────────────────────────────────────────
// Normalize one system_audit_log row into the shape the activity feed expects,
// tolerating different column names since the table schema isn't fixed here.
const normalizeAuditRow = (r) => {
  const when  = r.created_at ?? r.timestamp ?? r.logged_at ?? r.log_date ?? r.date ?? null;
  const title = r.action ?? r.event ?? r.activity ?? r.event_type ?? r.title ?? "Activity";
  const sub   = r.description ?? r.details ?? r.detail ?? r.message ?? r.entity ?? r.target ?? "";
  const actor = r.username ?? r.performed_by ?? r.user ?? r.actor ?? r.user_email ?? null;
  return {
    title:    String(title),
    subtitle: actor ? String(actor) : String(sub),
    detail:   String(sub),
    time:     when,
  };
};

// Admin dashboard: user counts (total / active / new in last 30d), audit-event
// count, and a recent system-activity feed (from system_audit_log).
export const getAdminDashboard = async () => {
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);           // cutoff for "new users" = 30 days ago
  const since30Iso = since30.toISOString();

  // three COUNT-only queries in parallel: total / active / new-in-30d users
  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: newUsers },
  ] = await Promise.all([
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }).gte("created_at", since30Iso),
  ]);

  // Audit log — may be permission-restricted or have varying columns; degrade safely
  let auditCount = 0;
  let activity   = [];
  try {
    const { count, error: cntErr } = await supabaseAdmin
      .from("system_audit_log")
      .select("*", { count: "exact", head: true });
    if (!cntErr) auditCount = count ?? 0;

    // No .order() — column name isn't known here; sort after normalizing
    const { data: rows, error: rowErr } = await supabaseAdmin
      .from("system_audit_log")
      .select("*")
      .limit(50);
    if (!rowErr && Array.isArray(rows)) {
      activity = rows
        .map(normalizeAuditRow)
        .sort((a, b) => new Date(b.time ?? 0) - new Date(a.time ?? 0))
        .slice(0, 8);
    }
  } catch {
    // table not accessible yet — leave audit at 0 / empty
  }

  return {
    stats: {
      totalUsers:  totalUsers  ?? 0,
      activeUsers: activeUsers ?? 0,
      newUsers:    newUsers    ?? 0,
      auditEvents: auditCount,
    },
    activity,
  };
};

// Principal dashboard stats: student/supervisor/active-student counts, announcements
// posted, active school year, and recent announcements for the notifications panel.
export const getDashboardStats = async () => {
  // all the counts + lookups for the cards run in parallel
  const [
    { count: totalStudents },
    { count: totalTeachers },
    { count: totalAdmins },
    { count: activeStudents },       // students whose linked user account is active
    { count: announcementsPosted },
    { data: schoolYear },            // the active school year
    { data: students },              // enrollment_date rows (for the trend chart)
    { data: announcements },         // 5 most recent for the notifications panel
  ] = await Promise.all([
    supabaseAdmin.from("student").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("teacher").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("principal").select("*", { count: "exact", head: true }),
    // Active students = students whose linked user account is active
    supabaseAdmin
      .from("student")
      .select("student_id, users!inner(is_active)", { count: "exact", head: true })
      .eq("users.is_active", true),
    supabaseAdmin.from("announcement").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin.from("school_year").select("*").eq("is_active", true).single(),
    supabaseAdmin.from("student").select("enrollment_date"),
    supabaseAdmin
      .from("announcement")
      .select("ann_id, title, posted_date, audience_role, principal(first_name, last_name)")
      .eq("is_active", true)
      .order("posted_date", { ascending: false })
      .limit(5),
  ]);

  const totalEmployees = (totalTeachers || 0) + (totalAdmins || 0);   // supervisors + admins

  // active enrollments = diagnostic assessments taken this school year
  let activeEnrollments = 0;
  if (schoolYear) {
    const { count } = await supabaseAdmin
      .from("diagnostic_assessment")
      .select("*", { count: "exact", head: true })
      .eq("sy_id", schoolYear.sy_id);
    activeEnrollments = count || 0;
  }

  const enrollmentTrends = buildEnrollmentTrends(students || []);   // monthly enrollment chart data

  return {
    totalStudents:       totalStudents       || 0,
    totalSupervisors:    totalTeachers       || 0,
    activeStudents:      activeStudents      || 0,
    announcementsPosted: announcementsPosted || 0,
    totalEmployees,
    activeEnrollments,
    schoolYear:          schoolYear          || null,
    enrollmentTrends,
    recentAnnouncements: announcements       || [],
  };
};

const buildEnrollmentTrends = (students) => {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      year:  d.getFullYear(),
      monthIndex: d.getMonth(),
      count: 0,
    });
  }

  students.forEach(({ enrollment_date }) => {
    if (!enrollment_date) return;
    const d = new Date(enrollment_date);
    const match = months.find(
      (m) => m.monthIndex === d.getMonth() && m.year === d.getFullYear()
    );
    if (match) match.count++;
  });

  const max = Math.max(...months.map((m) => m.count), 1);

  return months.map((m, i) => ({
    month:  m.month,
    count:  m.count,
    height: `${Math.max(Math.round((m.count / max) * 100), 8)}%`,
    active: i === months.length - 1,
  }));
};