import { useState, useEffect } from "react";
import { fetchPaceAnalyticsOverview } from "../../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const pct = (n) => `${(n ?? 0).toFixed(2)}%`;

const StatCard = ({ icon, iconColor, label, value, sub, subColor }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5 flex items-start gap-3">
    <span className={`material-symbols-outlined text-2xl shrink-0 ${iconColor}`} style={fillStyle}>{icon}</span>
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant leading-tight">{label}</p>
      <p className="text-3xl font-extrabold text-on-surface mt-1">{value}</p>
      {sub && <p className={`text-[11px] font-bold mt-0.5 ${subColor ?? "text-on-surface-variant"}`}>{sub}</p>}
    </div>
  </div>
);

// 4-segment donut
function Donut({ segs, total }) {
  const r = 70, cx = 90, cy = 90, circ = 2 * Math.PI * r;
  const sum = segs.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="22" className="text-surface-container-high" />
      {segs.map((s, i) => {
        const frac = s.value / sum;
        const dash = frac * circ;
        const off = -(acc / sum) * circ;
        acc += s.value;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="22"
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={off}
            transform={`rotate(-90 ${cx} ${cy})`} />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-on-surface" style={{ fontSize: 28, fontWeight: 800 }}>{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="fill-on-surface-variant" style={{ fontSize: 9, letterSpacing: 1 }}>TOTAL STUDENTS</text>
    </svg>
  );
}

// PACE Analytics tab of Student Monitoring. The remaining completion-status donut
// is built from GET /teacher/pace-analytics-overview
// (teacher.service.getPaceAnalyticsOverview). Respects the page's Grade Level filter.
export default function PaceAnalyticsTab({ grade }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    setLoading(true);
    fetchPaceAnalyticsOverview({ grade })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [grade]);

  if (loading) return <div className="py-20 text-center text-sm text-on-surface-variant"><span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" /> <span className="ml-2 align-middle">Loading analytics…</span></div>;
  if (error)   return <div className="m-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>;

  const s    = data?.stats ?? {};
  const otl  = data?.onTimeVsLate ?? { onTime: 0, late: 0, extended: 0, notCompleted: 0, total: 0 };
  const below = data?.below50 ?? [];

  const donutSegs = [
    { label: "On Time",       value: otl.onTime,       color: "#22c55e" },
    { label: "Late",          value: otl.late,         color: "#f97316" },
    { label: "Extended",      value: otl.extended,     color: "#3b82f6" },
    { label: "Not Completed", value: otl.notCompleted, color: "#ef4444" },
  ];
  const otlPct = (v) => otl.total ? `${Math.round((v / otl.total) * 1000) / 10}%` : "0%";

  return (
    <div className="p-5 space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="donut_large" iconColor="text-green-500" label="Average Completion Rate" value={pct(s.avgCompletionRate)} sub="Across all students" subColor="text-green-600" />
        <StatCard icon="stars" iconColor="text-purple-500" label="Average Performance Points" value={`${(s.avgPerformancePoints ?? 0).toFixed(2)} pts`} sub="Across all students" subColor="text-purple-600" />
        <StatCard icon="checklist" iconColor="text-blue-500" label="Students Ready for PACE Test" value={s.studentsReady ?? 0} sub={`${s.totalStudents ? Math.round((s.studentsReady / s.totalStudents) * 10000) / 100 : 0}% of total students`} subColor="text-blue-600" />
        <StatCard icon="error" iconColor="text-red-500" label="Students Needing Intervention" value={s.needingIntervention ?? 0} sub={`${s.totalStudents ? Math.round((s.needingIntervention / s.totalStudents) * 10000) / 100 : 0}% of total students`} subColor="text-red-500" />
      </div>

      {/* Remaining detailed analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2 text-center">On-Time vs Late Completion</p>
          <div className="flex justify-center"><Donut segs={donutSegs} total={otl.total} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[11px]">
            {donutSegs.map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
                <span className="text-on-surface-variant">{seg.label} <strong className="text-on-surface">{seg.value}</strong> ({otlPct(seg.value)})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
          <p className="text-sm font-extrabold text-on-surface mb-3">Students Below 50% Completion Rate</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/15">
                <th className="py-2 text-left">Student ID</th>
                <th className="py-2 text-left">Student Name</th>
                <th className="py-2 text-left">Comp. Rate</th>
                <th className="py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {below.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-on-surface-variant">No students below 50%.</td></tr>
              ) : below.slice(0, 5).map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10">
                  <td className="py-3 text-on-surface-variant">{r.id}</td>
                  <td className="py-3 font-bold text-on-surface">{r.name}</td>
                  <td className="py-3 text-on-surface-variant">{Math.round(r.completion)}%</td>
                  <td className="py-3 text-right"><span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-red-100 text-red-600">NEEDS ATTENTION</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {below.length > 5 && <p className="text-[11px] font-bold text-primary mt-3">View all students needing intervention ›</p>}
        </div>
      </div>
    </div>
  );
}
