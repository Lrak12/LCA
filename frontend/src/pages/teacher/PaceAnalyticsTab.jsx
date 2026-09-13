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

const QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

function CompletionByQuarterChart({ values = [] }) {
  const width = 800;
  const height = 200;
  const left = 58;
  const right = 24;
  const top = 36;
  const bottom = 55;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const baseline = top + plotHeight;
  const rates = QUARTER_LABELS.map((_, index) => {
    const value = Number(values[index]);
    return values[index] != null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  });
  const points = rates.map((value, index) => value == null ? null : ({
      value,
      index,
      x: left + (plotWidth * index) / (rates.length - 1),
      y: top + plotHeight - (value / 100) * plotHeight,
    }))
    .filter(Boolean);
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
    : "";
  const formatRate = (value) => `${Math.round(value * 10) / 10}%`;

  return (
    <svg className="w-full h-auto" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="quarter-chart-title quarter-chart-desc">
      <title id="quarter-chart-title">PACE completion by quarter</title>
      <desc id="quarter-chart-desc">Line chart showing cumulative completion rates from the first through fourth quarter.</desc>

      {[0, 25, 50, 75, 100].map((tick) => {
        const y = top + plotHeight - (tick / 100) * plotHeight;
        return (
          <g key={tick}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={left - 14} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">{tick}%</text>
          </g>
        );
      })}

      {points.length > 0 && (
        <>
          <path d={areaPath} fill="#3b82f6" fillOpacity="0.08" />
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {points.map((point) => (
        <g key={QUARTER_LABELS[point.index]}>
          <circle cx={point.x} cy={point.y} r="6" fill="#3b82f6" stroke="white" strokeWidth="3" />
          <text x={point.x} y={point.y - 14} textAnchor="middle" fill="#2563eb" fontSize="12" fontWeight="800">
            {formatRate(point.value)}
          </text>
        </g>
      ))}

      {QUARTER_LABELS.map((label, index) => (
        <text key={label} x={left + (plotWidth * index) / (QUARTER_LABELS.length - 1)} y={baseline + 27} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
          {label}
        </text>
      ))}

      <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">
        Completion Rate (%)
      </text>
    </svg>
  );
}

// PACE Analytics section of Student Monitoring. The completion-by-quarter chart
// is built from GET /teacher/pace-analytics-overview
// (teacher.service.getPaceAnalyticsOverview). Respects the page's Grade Level filter.
export default function PaceAnalyticsTab({ grade }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchPaceAnalyticsOverview({ grade })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [grade]);

  if (loading) return <div className="py-20 text-center text-sm text-on-surface-variant"><span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" /> <span className="ml-2 align-middle">Loading analytics…</span></div>;
  if (error)   return <div className="m-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>;

  const s    = data?.stats ?? {};
  const completionByQuarter = data?.completionByQuarter ?? [null, null, null, null];
  const intervention = data?.intervention ?? [];

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
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">PACE Completion by Quarter</p>
          <CompletionByQuarterChart values={completionByQuarter} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
          <p className="text-sm font-extrabold text-on-surface mb-3">Students Requiring Intervention</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/15">
                <th className="py-2 text-left">Student ID</th>
                <th className="py-2 text-left">Student Name</th>
                <th className="py-2 text-left">Comp. Rate</th>
                <th className="py-2 text-left">Main Concern</th>
              </tr>
            </thead>
            <tbody>
              {intervention.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-on-surface-variant">No students currently require intervention.</td></tr>
              ) : intervention.slice(0, 5).map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/10">
                  <td className="py-3 text-on-surface-variant">{r.id}</td>
                  <td className="py-3 font-bold text-on-surface">{r.name}</td>
                  <td className="py-3 text-on-surface-variant">{Math.round(r.completion)}%</td>
                  <td className="py-3 text-on-surface-variant">{r.concern}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {intervention.length > 5 && <p className="text-[11px] font-bold text-primary mt-3">View all students requiring intervention ›</p>}
        </div>
      </div>
    </div>
  );
}
