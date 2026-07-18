// Security & Audit Logs (principal): security overview cards (last login, active sessions,
// failed attempts).
//
// TWO CAVEATS: (1) backed by MOCK data - load() fakes a setTimeout, there's no API call yet
// (see the TODO). (2) NOT WIRED IN - nothing imports or renders <SecurityAuditLogs>, so the
// onRefresh prop is never supplied (defaults to the no-op below) and this component never
// appears in the running app. Unfinished feature, like AcademicConfiguration/ManageYearModal.
import { useState, useEffect } from "react";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// one security overview stat card
const StatCard = ({ icon, iconBg, iconColor, badge, badgeColor, label, value, sub }) => (
  <div className="flex-1 min-w-[180px] bg-white rounded-2xl p-6 border border-outline-variant/20 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <span className={`material-symbols-outlined text-xl ${iconColor}`} style={fillStyle}>
          {icon}
        </span>
      </div>
      {badge && (
        <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">
      {label}
    </p>
    <p className="font-headline text-3xl font-extrabold text-on-surface leading-tight">
      {value}
    </p>
    {sub && (
      <p className="text-[11px] text-on-surface-variant mt-1">{sub}</p>
    )}
  </div>
);

// onRefresh: would be supplied by a parent page, but none renders this -> stays the no-op default.
export default function SecurityAuditLogs({ onRefresh = () => {} }) {
  const [loading, setLoading]   = useState(true);
  const [overview, setOverview] = useState(null);  // security overview data (mock for now)
  const [error, setError]       = useState("");

  // load the overview; currently fakes a network delay + returns mock data
  const load = () => {
    setLoading(true);
    setError("");
    // TODO: replace with real API call e.g. fetchSecurityOverview()
    setTimeout(() => {
      setOverview({
        lastLogin: {
          datetime: "Oct 24, 08:32 AM",
          by: "Admin1 (Super Administrator)",
        },
        activeSessions: {
          count: 4,
          sub: "Across 2 devices",
        },
        failedAttempts: {
          count: 2,
          sub: "Last from IP 192.168.1.45",
        },
      });
      setLoading(false);
    }, 800);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => { load(); onRefresh(); };

  return (
    <div className="space-y-8">

      {/* ── Section header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="w-1 h-7 rounded-full bg-secondary" />
            <h3 className="font-headline text-xl font-extrabold text-primary">
              Security &amp; Audit Logs
            </h3>
          </div>
          <p className="text-sm text-on-surface-variant pl-4">
            Monitor system access and track administrative changes.
          </p>
        </div>
        {/* Refresh Logs -> handleRefresh() (re-runs load() + fires onRefresh) */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity shadow-sm"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh Logs
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* ── Security Overview ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
          Security Overview
        </p>

        {loading ? (
          <div className="flex gap-4 flex-wrap">
            <Skeleton className="h-40 flex-1 min-w-[180px]" />
            <Skeleton className="h-40 flex-1 min-w-[180px]" />
            <Skeleton className="h-40 flex-1 min-w-[180px]" />
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">

            {/* Last Successful Login */}
            <StatCard
              icon="login"
              iconBg="bg-green-100"
              iconColor="text-green-600"
              badge="Success"
              badgeColor="bg-green-100 text-green-700"
              label="Last Successful Login"
              value={overview.lastLogin.datetime}
              sub={`By ${overview.lastLogin.by}`}
            />

            {/* Active Admin Sessions */}
            <StatCard
              icon="devices"
              iconBg="bg-primary/10"
              iconColor="text-primary"
              badge={`${overview.activeSessions.count} Active`}
              badgeColor="bg-primary/10 text-primary"
              label="Active Admin Sessions"
              value={`${String(overview.activeSessions.count).padStart(2, "0")} Sessions`}
              sub={overview.activeSessions.sub}
            />

            {/* Failed Login Attempts */}
            <StatCard
              icon="gpp_bad"
              iconBg="bg-red-50"
              iconColor="text-red-500"
              badge="Alert"
              badgeColor="bg-red-100 text-red-600"
              label="Failed Login Attempts (24H)"
              value={`${String(overview.failedAttempts.count).padStart(2, "0")} Attempts`}
              sub={overview.failedAttempts.sub}
            />

          </div>
        )}
      </div>

    </div>
  );
}