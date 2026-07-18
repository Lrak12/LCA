import { useState, useEffect } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentDashboard } from "../../api/student.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// ─── Greeting ─────────────────────────────────────────────────────────────────
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, iconBg, iconColor, label, value, badge, badgeColor, dark }) => (
  <div className={`rounded-2xl p-6 flex flex-col gap-3 ${dark ? "bg-primary text-white" : "bg-white shadow-sm border border-outline-variant/20"}`}>
    <div className="flex items-center justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? "bg-white/10" : iconBg}`}>
        <span className={`material-symbols-outlined text-xl ${dark ? "text-white" : iconColor}`} style={fillStyle}>
          {icon}
        </span>
      </div>
      {badge && (
        <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${dark ? "bg-white/20 text-white" : badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
    <div>
      <p className={`text-[10px] font-extrabold tracking-widest uppercase mb-1 ${dark ? "text-white/60" : "text-on-surface-variant"}`}>
        {label}
      </p>
      <p className={`font-headline text-4xl font-extrabold ${dark ? "text-white" : "text-primary"}`}>
        {value}
      </p>
    </div>
  </div>
);

// ─── PACE Progress Chart (simple SVG line) ────────────────────────────────────
const PaceChart = ({ data = [] }) => {
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-on-surface-variant text-sm">
      No data available yet.
    </div>
  );

  const W = 600, H = 140, padL = 10, padR = 10, padT = 10, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max   = Math.max(...data.map((d) => d.count), 1);
  const step  = data.length > 1 ? plotW / (data.length - 1) : plotW;

  const points = data.map((d, i) => ({
    x: padL + i * step,
    y: padT + plotH - (d.count / max) * plotH,
    label: d.month,
    count: d.count,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${H - padB} L ${points[0].x} ${H - padB} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48 overflow-visible">
      <defs>
        <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(0 32 69)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="rgb(0 32 69)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#paceGrad)" />
      <path d={linePath} fill="none" stroke="rgb(0 32 69)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="4" fill="rgb(0 32 69)" />
          <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" className="fill-on-surface-variant font-bold uppercase tracking-widest">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ─── Quick Action Card ─────────────────────────────────────────────────────────
const QuickAction = ({ icon, iconBg, iconColor, title, sub, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
  >
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      <span className={`material-symbols-outlined text-base ${iconColor}`} style={fillStyle}>{icon}</span>
    </div>
    <div>
      <p className="text-sm font-extrabold text-on-surface">{title}</p>
      <p className="text-[11px] text-on-surface-variant">{sub}</p>
    </div>
  </button>
);

// ─── Announcement item ────────────────────────────────────────────────────────
const AnnouncementItem = ({ icon, iconBg, iconColor, title, meta }) => (
  <div className="flex items-start gap-3">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
      <span className={`material-symbols-outlined text-sm ${iconColor}`} style={fillStyle}>{icon}</span>
    </div>
    <div>
      <p className="text-sm font-bold text-on-surface leading-tight">{title}</p>
      <p className="text-[11px] text-on-surface-variant mt-0.5">{meta}</p>
    </div>
  </div>
);

// ─── Subject icon colors ──────────────────────────────────────────────────────
const subjectColors = {
  Mathematics: { bg: "bg-blue-100",   text: "text-blue-600",   icon: "calculate"     },
  English:     { bg: "bg-rose-100",   text: "text-rose-600",   icon: "menu_book"     },
  Science:     { bg: "bg-green-100",  text: "text-green-600",  icon: "science"       },
  default:     { bg: "bg-amber-100",  text: "text-amber-600",  icon: "auto_stories"  },
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user }          = useAuth();
  const schoolYearLabel   = useSchoolYear();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStudentDashboard()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name ?? user?.username ?? "Student";

  // Mock chart data while API not connected
  const chartData = data?.paceChart ?? [
    { month: "May", count: 2 },
    { month: "Jun", count: 3 },
    { month: "Jul", count: 5 },
    { month: "Aug", count: 4 },
    { month: "Sep", count: 6 },
    { month: "Oct", count: 5 },
  ];

  const paceStats     = data?.paceStats     ?? { completed: 5, ongoing: 2, remaining: 3 };
  const overallScore  = data?.overallScore  ?? 88.6;
  const currentPace   = data?.currentPace   ?? { subject: "Mathematics", module: "Math 4B", status: "In Progress", progress: 72, latestCheckup: 85 };
  const announcements = data?.announcements ?? [
    { id: 1, icon: "schedule",    iconBg: "bg-slate-100",  iconColor: "text-slate-600", title: "Submission of Incomplete PACEs", meta: "30 minutes ago • Teacher"     },
    { id: 2, icon: "assignment",  iconBg: "bg-amber-100",  iconColor: "text-amber-600", title: "PACE Test Schedule Released",    meta: "45 minutes ago • Teacher"     },
    { id: 3, icon: "groups",      iconBg: "bg-blue-100",   iconColor: "text-blue-600",  title: "Parents Meeting Reminder",       meta: "3 hours ago • Administrator"  },
    { id: 4, icon: "event_busy",  iconBg: "bg-red-100",    iconColor: "text-red-500",   title: "No Classes on June 30",          meta: "5 hours ago • Administrator"  },
  ];

  const subjectStyle = subjectColors[currentPace.subject] ?? subjectColors.default;

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
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
            <p className="text-on-surface-variant mt-1 max-w-lg">
              Here is your current academic progress. You can monitor your PACE
              completion, assessment results, and overall performance.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Stat Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          ) : (
            <>
              <StatCard
                icon="check_circle"
                iconBg="bg-green-100"
                iconColor="text-green-600"
                label="Completed PACEs"
                value={paceStats.completed}
                badge="+1 This Week"
                badgeColor="bg-green-100 text-green-700"
              />
              <StatCard
                icon="pending"
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                label="Ongoing PACEs"
                value={paceStats.ongoing}
                badge="No Change"
                badgeColor="bg-slate-100 text-slate-500"
              />
              <StatCard
                icon="hourglass_empty"
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                label="Remaining PACEs"
                value={paceStats.remaining}
                badge="+1 From Last Update"
                badgeColor="bg-blue-100 text-blue-700"
              />
              <StatCard
                icon="verified"
                iconBg=""
                iconColor=""
                label="Overall Score"
                value={`${overallScore}%`}
                badge="+2.4% From Last Assessment"
                dark
              />
            </>
          )}
        </div>

        {/* ── Main Grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 mb-6">

          {/* PACE Progress Chart */}
          <article className="bg-white rounded-2xl p-7 shadow-sm border border-outline-variant/20">
            <h3 className="font-headline text-xl font-extrabold text-primary mb-1">PACE Progress Over Time</h3>
            <p className="text-xs text-on-surface-variant mb-6">Monthly comparison of PACE completion</p>
            {loading ? <Skeleton className="h-48 w-full" /> : <PaceChart data={chartData} />}
          </article>

          {/* Quick Actions */}
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h3 className="font-headline text-lg font-extrabold text-primary mb-5">Quick Actions</h3>
            <div className="space-y-2">
              <QuickAction
                icon="description"
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                title="Report Card"
                sub="View Full Report Card"
              />
              <QuickAction
                icon="menu_book"
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                title="PACE Details"
                sub="View PACE Details"
              />
              <QuickAction
                icon="event_available"
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
                title="Attendance"
                sub="View Attendance"
              />
            </div>
          </article>
        </div>

        {/* ── Bottom Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">

          {/* Current PACE Module */}
          <article className="bg-white rounded-2xl p-7 shadow-sm border border-outline-variant/20">
            <h3 className="font-headline text-xl font-extrabold text-primary mb-6">Current PACE Module</h3>

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="overflow-x-auto">
                {/* Column headers */}
                <div className="grid grid-cols-5 gap-4 mb-4 min-w-[440px]">
                  {["Subject", "Module", "Status", "Progress", "Latest Check-up Score"].map((h) => (
                    <p key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-center">
                      {h}
                    </p>
                  ))}
                </div>

                {/* Row */}
                <div className="grid grid-cols-5 gap-4 items-center min-w-[440px]">
                  {/* Subject */}
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${subjectStyle.bg}`}>
                      <span className={`material-symbols-outlined text-xl ${subjectStyle.text}`} style={fillStyle}>
                        {subjectStyle.icon}
                      </span>
                    </div>
                    <p className="text-sm font-extrabold text-on-surface text-center">{currentPace.subject}</p>
                  </div>

                  {/* Module */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl text-rose-600" style={fillStyle}>auto_stories</span>
                    </div>
                    <p className="text-sm font-extrabold text-on-surface text-center">{currentPace.module}</p>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl text-green-600" style={fillStyle}>sync</span>
                    </div>
                    <p className="text-sm font-extrabold text-on-surface text-center">{currentPace.status}</p>
                  </div>

                  {/* Progress */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl text-amber-600" style={fillStyle}>bar_chart</span>
                    </div>
                    <p className="text-sm font-extrabold text-on-surface text-center">{currentPace.progress}%</p>
                  </div>

                  {/* Latest Checkup */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-xl text-purple-600" style={fillStyle}>bar_chart</span>
                    </div>
                    <p className="text-sm font-extrabold text-on-surface text-center">{currentPace.latestCheckup}%</p>
                  </div>
                </div>
              </div>
            )}
          </article>

          {/* Announcements */}
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-headline text-lg font-extrabold text-primary">Announcements</h3>
              <span className="text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                Live
              </span>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <AnnouncementItem key={ann.id} {...ann} />
                ))}
              </div>
            )}

            <button className="mt-6 w-full py-2.5 rounded-xl border border-outline-variant/30 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              View All Announcements
            </button>
          </article>

        </div>
      </main>
    </StudentLayout>
  );
}