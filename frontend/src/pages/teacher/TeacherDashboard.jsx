// Supervisor home dashboard: greeting, 4 class stat cards, today's attendance,
// quick actions, recent activity. Data from GET /teacher/dashboard
// (teacher.service.getTeacherDashboard).
import { useState, useEffect } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchTeacherDashboard } from "../../api/teacher.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// grey pulsing placeholder shown while data loads
const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// greeting based on the local hour
const getGreeting = () => {
  const hour = new Date().getHours();                 // 0-23 local hour
  if (hour < 12) return "Good morning";               // before noon
  if (hour < 17) return "Good afternoon";             // noon to 5pm
  return "Good evening";                              // after 5pm
};

// e.g. "July 10, 2026" for the date badge
const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ─── Stat Card ────────────────────────────────────────────────────────────────
// reusable metric card. NB: the dashboard below inlines its own card markup, so
// this + the next 3 helpers aren't actually rendered right now.
const StatCard = ({ icon, iconBg, iconColor, label, value, badge, badgeColor }) => (
  <div className="bg-white rounded-2xl p-6 flex flex-col gap-3 shadow-sm border border-outline-variant/20">
    <div className="flex items-center justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <span className={`material-symbols-outlined text-xl ${iconColor}`} style={fillStyle}>{icon}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${badgeColor}`}>
          {badge}%
        </span>
      )}
    </div>
    <div>
      <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">{label}</p>
      <p className="font-headline text-4xl font-extrabold text-primary">{value}</p>
    </div>
  </div>
);

// ─── Progress Bar ─────────────────────────────────────────────────────────────
// 0-100 filled bar with a % label
const ProgressBar = ({ value, color = "bg-green-500" }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
    </div>
    <span className="text-xs font-extrabold text-on-surface w-8 text-right">{value}%</span>
  </div>
);

// ─── Status Badge ─────────────────────────────────────────────────────────────
// green "On Track" vs amber pill otherwise
const StatusBadge = ({ status }) => (
  <span className={`text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${
    status === "On Track" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
  }`}>
    {status}
  </span>
);

// ─── Quick Action ─────────────────────────────────────────────────────────────
// icon + title + subtitle shortcut row
const QuickAction = ({ icon, iconBg, iconColor, title, sub }) => (
  <button className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-container-low transition-colors text-left">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      <span className={`material-symbols-outlined text-base ${iconColor}`} style={fillStyle}>{icon}</span>
    </div>
    <div>
      <p className="text-sm font-extrabold text-on-surface">{title}</p>
      <p className="text-[11px] text-on-surface-variant">{sub}</p>
    </div>
  </button>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
// Loads once on mount via fetchTeacherDashboard(); `data` = { teacher, stats,
// attendance, recentActivity }.
export default function TeacherDashboard() {
  const { user }              = useAuth();               // logged-in user (for the greeting name)
  const schoolYearLabel       = useSchoolYear();         // active school-year label for the layout header
  const [data, setData]       = useState(null);          // the API response ({stats, attendance, ...}) or null
  const [loading, setLoading] = useState(true);          // true until the first fetch resolves (drives skeletons)
  const [error, setError]     = useState("");            // API error message shown in the red banner

  // Load the dashboard data ONCE on mount. On success store it; on failure store
  // the message; either way stop the loading state.
  useEffect(() => {
    fetchTeacherDashboard()                              // GET /teacher/dashboard (see banner)
      .then((res) => setData(res.data))                  // res.data = { teacher, stats, attendance, recentActivity }
      .catch((err) => setError(err.message))             // network / server error > red banner
      .finally(() => setLoading(false));                 // hide skeletons whether it succeeded or failed
  }, []);                                                 // [] = run once, never re-fetch

  const firstName = user?.first_name ?? user?.username ?? "Supervisor"; // greeting name, with fallbacks

  // stats / attendance / recentActivity: read from `data`, but fall back to safe
  // zero-values so the first render (before the fetch resolves) never crashes.
  const stats = data?.stats ?? {
    totalStudents: 0,
    onTrack: 0, onTrackPct: 0,
    behind: 0,  behindPct: 0,
    ahead: 0,   aheadPct: 0,
  };

  const attendance    = data?.attendance    ?? { late: 0, absent: 0, present: 0 }; // today's tallies
  const recentActivity = data?.recentActivity ?? [];                               // list of recent completions

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              {getGreeting()}, {firstName}.
            </h2>
            <p className="text-on-surface-variant mt-1">
              Here is your class progress overview today.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Stat Cards ──────────────────────────────────────────── */}
        {/* While loading show 4 skeletons; once loaded, map 4 cards straight
            from `stats` (totalStudents / onTrack / behind / ahead). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)
          ) : (
            <>
              {[
                { icon: "accessibility_new", iconBg: "bg-blue-100",   iconColor: "text-blue-600",   label: "Total Students",    value: stats.totalStudents },
                { icon: "trending_up",       iconBg: "bg-green-100",  iconColor: "text-green-600",  label: "Students On Track", value: stats.onTrack       },
                { icon: "warning",           iconBg: "bg-amber-100",  iconColor: "text-amber-600",  label: "Students Behind",   value: stats.behind        },
                { icon: "star",              iconBg: "bg-purple-100", iconColor: "text-purple-600", label: "Students Ahead",    value: stats.ahead         },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${c.iconBg}`}>
                    <span className={`material-symbols-outlined text-3xl ${c.iconColor}`} style={fillStyle}>{c.icon}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">{c.label}</p>
                    <p className="font-headline text-4xl font-extrabold text-primary">{c.value}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Middle Row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">

          {/* Class Attendance (Today) - the 3 tallies from `attendance`
              (late / absent / present), computed server-side from today's
              attendance rows in getTeacherDashboard. */}
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h3 className="font-headline text-lg font-extrabold text-primary">
              Class Attendance <span className="text-on-surface-variant font-medium text-sm">(Today)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
              ) : (
                [
                  { icon: "schedule",   iconBg: "bg-blue-100",  iconColor: "text-blue-500",  label: "Late",    value: attendance.late    },
                  { icon: "person_off", iconBg: "bg-green-100", iconColor: "text-green-600", label: "Absent",  value: attendance.absent  },
                  { icon: "how_to_reg", iconBg: "bg-amber-100", iconColor: "text-amber-600", label: "Present", value: attendance.present },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.iconBg}`}>
                      <span className={`material-symbols-outlined text-xl ${item.iconColor}`} style={fillStyle}>{item.icon}</span>
                    </div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{item.label}</p>
                    <p className="font-headline text-2xl font-extrabold text-primary">{item.value}</p>
                  </div>
                ))
              )}
            </div>
          </article>

          {/* Quick Actions - static shortcut buttons (labels/icons hard-coded
              below). NOTE: these are display-only right now; they have no onClick
              navigation wired yet. */}
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h3 className="font-headline text-lg font-extrabold text-primary mb-4">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { icon: "assignment",      iconBg: "bg-blue-100",   iconColor: "text-blue-600",   title: "Record Assessment",    sub: "Check-ups, Self-tests, PACE tests"              },
                { icon: "bar_chart",       iconBg: "bg-amber-100",  iconColor: "text-amber-600",  title: "Student Monitoring",   sub: "Projected, Completed, Ongoing, Remaining"       },
                { icon: "event_available", iconBg: "bg-green-100",  iconColor: "text-green-600",  title: "Record Attendance",    sub: "Student class attendance performance"           },
                { icon: "description",     iconBg: "bg-purple-100", iconColor: "text-purple-600", title: "View/Generate Reports",sub: "Student Performance and progress reports"       },
              ].map((a) => (
                <button key={a.title} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container-lowest transition-colors text-left">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.iconBg}`}>
                    <span className={`material-symbols-outlined text-base ${a.iconColor}`} style={fillStyle}>{a.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-on-surface">{a.title}</p>
                    <p className="text-[11px] text-on-surface-variant">{a.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </article>

          {/* Recent Activity - maps `recentActivity` (up to 3 most-recently
              completed PACEs, built server-side). Empty state if none. */}
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-extrabold text-primary">Recent Activity</h3>
              <button className="text-sm font-bold text-primary hover:underline">View All</button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-6">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
                      <span className={`material-symbols-outlined text-sm ${item.iconColor}`} style={fillStyle}>{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface leading-snug">{item.text}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="text-center text-xs text-on-surface-variant py-4 border-t border-outline-variant/20">
          @2026 All Rights Reserved // fix 
        </footer>

      </main>
    </TeacherLayout>
  );
}
