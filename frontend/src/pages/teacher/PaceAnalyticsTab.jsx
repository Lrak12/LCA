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

// Simple line chart for completion by quarter
function LineChart({ values }) {
  const W = 420, H = 220, padL = 36, padB = 30, padT = 10, padR = 10;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (i / 3) * innerW;
  const y = (v) => padT + innerH - (v / 100) * innerH;
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const labels = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} className="stroke-outline-variant/20" strokeWidth="1" />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" className="fill-on-surface-variant" style={{ fontSize: 9 }}>{g}%</text>
        </g>
      ))}
      <polyline points={pts} fill="none" className="stroke-blue-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="4" className="fill-blue-500" />
          <text x={x(i)} y={y(v) - 9} textAnchor="middle" className="fill-blue-600" style={{ fontSize: 10, fontWeight: 700 }}>{v}%</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-on-surface-variant" style={{ fontSize: 8 }}>{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

const BAR_COLORS = ["bg-green-500", "bg-blue-500", "bg-orange-500", "bg-red-500", "bg-purple-500", "bg-cyan-500"];
const DIST_COLORS = ["bg-green-500", "bg-blue-500", "bg-purple-500", "bg-red-500"];

// PACE Analytics tab of Student Monitoring. Charts (hand-rolled SVG: Donut/LineChart
// above) built from GET /teacher/pace-analytics-overview
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
  const bySubject = data?.completionBySubject ?? [];
  const dist = data?.pointsDistribution ?? [];
  const below = data?.below50 ?? [];
  const distMax = Math.max(1, ...dist.map((d) => d.count));

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

      {/* Row: line + donut + subject bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">PACE Completion by Quarter</p>
          <LineChart values={data?.completionByQuarter ?? [0, 0, 0, 0]} />
          <p className="text-[10px] text-center text-on-surface-variant mt-1">Completion Rate (%)</p>
        </div>

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
          <p className="text-sm font-extrabold text-on-surface mb-4">PACE Completion by Subject Area</p>
          <div className="space-y-3">
            {bySubject.length === 0 ? <p className="text-sm text-on-surface-variant">No data.</p> : bySubject.map((b, i) => (
              <div key={b.subject} className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant w-32 shrink-0 truncate">{b.subject}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} style={{ width: `${b.rate}%` }} />
                </div>
                <span className="text-xs font-bold text-on-surface w-9 text-right">{b.rate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row: distribution + below-50 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-4">Performance Points Distribution</p>
          <div className="flex items-end justify-around gap-3 h-48 px-2">
            {dist.map((d, i) => (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-sm font-extrabold text-on-surface mb-1">{d.count}</span>
                <div className={`w-full rounded-t-lg ${DIST_COLORS[i % DIST_COLORS.length]}`} style={{ height: `${(d.count / distMax) * 100}%`, minHeight: d.count > 0 ? 6 : 0 }} />
                <span className="text-[10px] text-on-surface-variant mt-2">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center text-on-surface-variant mt-2">PERFORMANCE POINTS</p>
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
