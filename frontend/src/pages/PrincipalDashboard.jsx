// Principal home dashboard: 4 stat cards, quick-access shortcuts, and recent
// announcements. Data from fetchDashboardStats (dashboard.service.getDashboardStats).
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDashboardStats } from "../api/dashboard.js";
import PrincipalLayout from "../components/PrincipalLayout.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const statCards = [
  { key: "totalStudents",       label: "Total Students",       icon: "groups",     tint: "bg-primary-fixed text-primary"     },
  { key: "totalSupervisors",    label: "Total Supervisor",     icon: "diversity_3", tint: "bg-secondary-fixed text-secondary" },
  { key: "activeStudents",      label: "Active Students",      icon: "person",     tint: "bg-tertiary-fixed text-secondary"  },
  { key: "announcementsPosted", label: "Announcements Posted", icon: "campaign",   tint: "bg-primary-fixed text-primary"     },
];

const quickAccess = [
  {
    icon: "menu_book",
    title: "Student Monitoring",
    sub: "View student records, PACE progress, and performance analytics.",
    path: "/admin/monitoring",
    tint: "bg-primary-fixed text-primary",
  },
  {
    icon: "biotech",
    title: "Diagnostic Assessment",
    sub: "Manage diagnostic results and PACE recommendations.",
    path: "/admin/diagnostic",
    tint: "bg-secondary-fixed text-secondary",
  },
  {
    icon: "description",
    title: "Reports",
    sub: "Generate and review academic and institutional reports.",
    path: "/admin/reports",
    tint: "bg-tertiary-fixed text-secondary",
  },
  {
    icon: "campaign",
    title: "Announcements",
    sub: "Create and manage school-wide announcements.",
    path: "/admin/announcements",
    tint: "bg-primary-fixed text-primary",
  },
];

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// Show a wall-clock time for today's items, otherwise a calendar date
const formatNotificationTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function PrincipalDashboard() {
  const navigate  = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchDashboardStats();
        setStats(res.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today    = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const schoolYearLabel = stats?.schoolYear?.year_label ?? "—";
  const notifications   = stats?.recentAnnouncements ?? [];   // shown in the notifications panel

  return (
    <PrincipalLayout schoolYearLabel={loading ? "..." : schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Welcome */}
        <header className="mb-10 flex justify-between items-start gap-4">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-extrabold text-primary font-headline tracking-tight mb-2">
              {greeting}, Principal.
            </h2>
            <p className="text-on-surface-variant text-lg leading-relaxed">
              Here's an overview of the school's key information and quick access to important tasks.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-low p-2 rounded-full px-4 shrink-0">
            <span className="material-symbols-outlined text-secondary">calendar_today</span>
            <span className="text-sm font-semibold text-primary whitespace-nowrap">{today}</span>
          </div>
        </header>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/20 shadow-sm flex flex-col items-center text-center"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${card.tint}`}>
                <span className="material-symbols-outlined" style={fillStyle}>{card.icon}</span>
              </div>
              <h3 className="text-on-surface-variant uppercase tracking-widest font-bold text-[11px] mb-2">
                {card.label}
              </h3>
              {loading
                ? <Skeleton className="h-9 w-20" />
                : <p className="text-4xl font-extrabold text-primary font-headline tracking-tighter">
                    {(stats?.[card.key] ?? 0).toLocaleString()}
                  </p>
              }
            </div>
          ))}
        </div>

        {/* Quick Access + Recent Notifications */}
        <div className="grid grid-cols-12 gap-8">

          {/* Quick Access */}
          <section className="col-span-12 lg:col-span-6">
            <h3 className="text-xl font-bold text-primary font-headline mb-6 tracking-tight">Quick Access</h3>
            <div className="space-y-4">
              {quickAccess.map((action) => (
                <button
                  key={action.title}
                  onClick={() => navigate(action.path)}
                  className="w-full flex items-center gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group text-left"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${action.tint}`}>
                    <span className="material-symbols-outlined" style={fillStyle}>{action.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-primary text-sm">{action.title}</p>
                    <p className="text-xs text-on-surface-variant">{action.sub}</p>
                  </div>
                  <span className="material-symbols-outlined text-base text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Notifications */}
          <section className="col-span-12 lg:col-span-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-primary font-headline tracking-tight">Recent Notifications</h3>
              <button
                onClick={() => navigate("/admin/announcements")}
                className="text-primary font-bold text-sm hover:underline"
              >
                View All
              </button>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm divide-y divide-outline-variant/15">
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-4 p-5">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2 w-1/2" />
                    </div>
                  </div>
                ))
              ) : notifications.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-10">No recent notifications.</p>
              ) : (
                notifications.map((ann) => (
                  <div key={ann.ann_id} className="flex items-start gap-4 p-5">
                    <div className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-base" style={fillStyle}>campaign</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-primary truncate">{ann.title}</p>
                      <p className="text-xs text-on-surface-variant">
                        {ann.principal
                          ? `Posted by ${ann.principal.first_name} ${ann.principal.last_name}`
                          : "Announcement posted"}
                      </p>
                    </div>
                    <span className="text-[11px] text-on-surface-variant whitespace-nowrap shrink-0">
                      {formatNotificationTime(ann.posted_date)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </PrincipalLayout>
  );
}
