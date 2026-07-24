// Admin (sysadmin) home dashboard: user-count stat cards, a system-activity feed,
// and quick actions.
// Backend chain (frontend api/admin.js fetchAdminDashboard -> routes/dashboard.routes.js):
//   GET /dashboard/admin -> controllers/dashboard.controller.js > getAdminStats (~line 10)
//                        -> services/dashboard.service.js > getAdminDashboard (~line 21)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout.jsx";
import { fetchAdminDashboard } from "../../api/admin.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// grey pulsing placeholder shown while loading
const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// greeting based on the local hour
const getGreeting = () => {
  const h = new Date().getHours();                 // 0-23 local hour
  if (h < 12) return "Good morning"; 
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// "July 10, 2026" for the header date
const formatDate = (d = new Date()) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// clock time for an activity timestamp (blank if missing/invalid)
const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

const STAT_CARDS = [
  { key: "totalUsers",  label: "Total Users",  icon: "groups",       iconBg: "bg-blue-100",   iconColor: "text-blue-600"   },
  { key: "activeUsers", label: "Active Users", icon: "verified_user", iconBg: "bg-green-100",  iconColor: "text-green-600"  },
  { key: "newUsers",    label: "New Users",    icon: "person_add",   iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  { key: "auditEvents", label: "Audit Events", icon: "description",  iconBg: "bg-amber-100",  iconColor: "text-amber-600"  },
];

// Map an activity title to an icon
const activityIcon = (title = "") => {
  const t = title.toLowerCase();
  if (t.includes("login"))                       return { icon: "login",           bg: "bg-amber-100",  color: "text-amber-600"  };
  if (t.includes("role"))                        return { icon: "key",             bg: "bg-purple-100", color: "text-purple-600" };
  if (t.includes("config") || t.includes("setting")) return { icon: "settings",   bg: "bg-blue-100",   color: "text-blue-600"   };
  if (t.includes("audit") || t.includes("report")) return { icon: "description",   bg: "bg-red-100",    color: "text-red-500"    };
  if (t.includes("delete") || t.includes("remove")) return { icon: "person_remove", bg: "bg-red-100",   color: "text-red-500"    };
  return { icon: "person_add", bg: "bg-green-100", color: "text-green-600" };
};

const QUICK_ACTIONS = [
  { label: "Add New User",            icon: "person_add",     iconBg: "bg-blue-100",   iconColor: "text-blue-600",   path: "/sysadmin/users"   },
  { label: "Manage User Roles",       icon: "verified_user",  iconBg: "bg-green-100",  iconColor: "text-green-600",  path: "/sysadmin/users"   },
  { label: "View Audit Logs",         icon: "receipt_long",   iconBg: "bg-purple-100", iconColor: "text-purple-600", path: "/sysadmin/audit"   },
  { label: "System Preferences",      icon: "tune",           iconBg: "bg-amber-100",  iconColor: "text-amber-600",  path: "/sysadmin/config"  },
  { label: "Manage Support Requests", icon: "support_agent",  iconBg: "bg-slate-100",  iconColor: "text-slate-600",  path: "/sysadmin/support" },
];

export default function AdminDashboard() {
  const { user }        = useAuth();
  const schoolYearLabel = useSchoolYear();
  const navigate        = useNavigate();

  const [data, setData]       = useState(null);    // API response { stats, activity }
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // load the dashboard once on mount
  useEffect(() => {
    fetchAdminDashboard()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats    = data?.stats ?? { totalUsers: 0, activeUsers: 0, newUsers: 0, auditEvents: 0 }; // zero-fallback for first render
  const activity = data?.activity ?? [];           // system-activity feed rows
  const firstName = user?.first_name ?? user?.username ?? "Admin"; // greeting name

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
              {getGreeting()}, {firstName}!
            </h2>
            <p className="text-on-surface-variant mt-1">Here's what's happening in the system today.</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Stat cards - map STAT_CARDS to the matching `stats` value (skeletons while loading) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
            : STAT_CARDS.map((c) => (
                <div key={c.key} className="bg-white rounded-2xl p-6 border border-outline-variant/20 shadow-sm">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${c.iconBg}`}>
                    <span className={`material-symbols-outlined text-xl ${c.iconColor}`} style={fillStyle}>{c.icon}</span>
                  </div>
                  <p className="text-[11px] font-bold text-on-surface-variant mb-1">{c.label}</p>
                  <p className="font-headline text-3xl font-extrabold text-on-surface">{stats[c.key]}</p>
                </div>
              ))}
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* System Activity - the `activity` feed; each row's icon comes from activityIcon(title) */}
          <section className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-headline text-lg font-extrabold text-on-surface">System Activity</h3>
              {/* View All -> navigate() to the full Audit Logs page */}
              <button onClick={() => navigate("/sysadmin/audit")} className="text-sm font-bold text-blue-600 hover:underline">View All</button>
            </div>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-on-surface-variant">No recent activity recorded.</p>
            ) : (
              <div className="space-y-1">
                {activity.map((a, i) => {
                  const ic = activityIcon(a.title);
                  return (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ic.bg}`}>
                        <span className={`material-symbols-outlined text-base ${ic.color}`} style={fillStyle}>{ic.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface leading-tight truncate">{a.title}</p>
                        {a.subtitle && <p className="text-[11px] text-on-surface-variant truncate">{a.subtitle}</p>}
                      </div>
                      <span className="text-[11px] text-on-surface-variant shrink-0">{formatTime(a.time)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick Actions - static shortcut buttons that navigate to other sysadmin pages */}
          <section className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
            <h3 className="font-headline text-lg font-extrabold text-on-surface mb-5">Quick Actions</h3>
            <div className="space-y-3">
              {/* each shortcut -> navigate(q.path) to the matching sysadmin page */}
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => navigate(q.path)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-outline-variant/20 hover:bg-surface-container-lowest hover:border-primary/30 transition-colors text-left"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${q.iconBg}`}>
                    <span className={`material-symbols-outlined text-base ${q.iconColor}`} style={fillStyle}>{q.icon}</span>
                  </div>
                  <span className="flex-1 text-sm font-bold text-on-surface">{q.label}</span>
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
                </button>
              ))}
            </div>
          </section>
        </div>

      </main>
    </AdminLayout>
  );
}
