import { useState, useEffect } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentAttendance } from "../../api/student.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const formatToday = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// "2025-05-01" → "May 1, 2025" (parsed as local date parts to avoid TZ shifts)
const formatISO = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const STATUS_STYLES = {
  Present:    { bg: "bg-green-100", text: "text-green-700" },
  Late:       { bg: "bg-amber-100", text: "text-amber-700" },
  Absent:     { bg: "bg-red-100",   text: "text-red-600"   },
  Excused:    { bg: "bg-blue-100",  text: "text-blue-700"  },
  "No Class": { bg: "bg-slate-100", text: "text-slate-500" },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES["No Class"];
  return (
    <span className={`text-[10px] font-extrabold tracking-wider uppercase px-3 py-1.5 rounded-full whitespace-nowrap ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
};

const LEGEND = [
  { label: "Present",  dot: "bg-green-500" },
  { label: "Late",     dot: "bg-amber-400" },
  { label: "Absent",   dot: "bg-red-500"   },
  { label: "Excused",  dot: "bg-blue-500"  },
  { label: "No Class", dot: "bg-slate-300" },
];

export default function Attendance() {
  const schoolYearLabel       = useSchoolYear();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [month, setMonth]     = useState(""); // "" = backend default (current month)

  useEffect(() => {
    fetchStudentAttendance(month || undefined)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [month]);

  const student  = data?.student ?? null;
  const stats    = data?.stats   ?? { schoolDays: 0, present: 0, late: 0, absent: 0, excused: 0, attendanceRate: 0 };
  const months   = data?.months  ?? [];
  const selected = month || data?.selectedMonth || "";
  const records  = data?.records ?? [];

  const fullName = student ? `${student.last_name}, ${student.first_name}` : "—";
  const initials = student
    ? `${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase()
    : "";

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
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary uppercase">
              Attendance
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-lg">
              Track your daily presence, check for lates, and monitor your total
              attendance percentage to ensure you're meeting requirements.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatToday()}</span>
          </div>
        </header>

        {/* ── Student Info + Stats Card ───────────────────────────── */}
        <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 px-7 py-5 mb-6">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4 min-w-0 md:flex-1">
                <div className="w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center shrink-0">
                  <span className="text-lg font-extrabold text-primary">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-on-surface truncate">{fullName}</p>
                  <p className="text-xs text-on-surface-variant">Student ID: {student?.student_id ?? "—"}</p>
                  <p className="text-xs text-on-surface-variant">{student?.grade_level ?? ""}</p>
                </div>
              </div>

              <div className="flex items-center gap-8 flex-wrap">
                {[
                  { label: "School Days",     value: stats.schoolDays,            color: "text-on-surface" },
                  { label: "Present",         value: stats.present,               color: "text-green-600"  },
                  { label: "Late",            value: stats.late,                  color: "text-amber-500"  },
                  { label: "Absent",          value: stats.absent,                color: "text-red-500"    },
                  { label: "Attendance Rate", value: `${stats.attendanceRate}%`,  color: "text-primary"    },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <p className={`text-[10px] font-extrabold tracking-widest uppercase mb-1 ${color === "text-on-surface" ? "text-on-surface-variant" : color}`}>
                      {label}
                    </p>
                    <p className={`font-headline text-3xl font-extrabold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* ── Month selector + Legend ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1">Month</label>
            <div className="relative inline-block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">calendar_month</span>
              <select
                value={selected}
                onChange={(e) => {
                  setLoading(true);
                  setError("");
                  setMonth(e.target.value);
                }}
                className="pl-9 pr-8 py-2 rounded-lg border border-outline-variant/30 bg-white text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none min-w-[180px]"
              >
                {months.length === 0 && selected && (
                  <option value={selected}>{selected}</option>
                )}
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">expand_more</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap pb-1">
            {LEGEND.map(({ label, dot }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Attendance Table ──────────────────────────────────────── */}
        <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
          {loading ? (
            <div className="p-7 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                    <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-7 py-3.5 text-left">Date</th>
                    <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-4 py-3.5 text-left">Day</th>
                    <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-4 py-3.5 text-left">AM Status</th>
                    <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-4 py-3.5 text-left">PM Status</th>
                    <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-7 py-3.5 text-right">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-7 py-10 text-center text-sm text-on-surface-variant">
                        No attendance records for this month yet.
                      </td>
                    </tr>
                  ) : records.map((r) => (
                    <tr key={r.date} className={r.noClass ? "bg-surface-container-lowest/50" : "hover:bg-surface-container-lowest transition-colors"}>
                      <td className={`px-7 py-3.5 text-sm font-bold whitespace-nowrap ${r.noClass ? "text-on-surface-variant/60" : "text-on-surface"}`}>
                        {formatISO(r.date)}
                      </td>
                      <td className={`px-4 py-3.5 text-sm whitespace-nowrap ${r.noClass ? "text-on-surface-variant/60" : "text-on-surface-variant"}`}>
                        {r.day}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={r.am_status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={r.pm_status} />
                      </td>
                      <td className={`px-7 py-3.5 text-sm text-right ${r.noClass ? "text-on-surface-variant/60" : "text-on-surface-variant"}`}>
                        {r.remarks || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

      </main>
    </StudentLayout>
  );
}
