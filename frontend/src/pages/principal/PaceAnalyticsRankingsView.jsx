import { useEffect, useState } from "react";
import { fetchAnalyticsReport } from "../../api/reports.js";

const STATUS_STYLE = {
  "On Track": "text-green-600",
  Ongoing: "text-orange-500",
  "Needs Intervention": "text-red-500",
};

const Head = ({ children, className = "" }) => (
  <th className={`border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant ${className}`}>
    {children}
  </th>
);

const Cell = ({ children, className = "" }) => (
  <td className={`border border-slate-200 px-3 py-2 text-xs text-on-surface ${className}`}>{children}</td>
);

const EmptyRow = ({ columns, text }) => (
  <tr><td colSpan={columns} className="border border-slate-200 px-3 py-8 text-center text-xs text-on-surface-variant">{text}</td></tr>
);

const Section = ({ title, children, className = "" }) => (
  <section className={className}>
    <h3 className="mb-2.5 text-[13px] font-extrabold text-on-surface">{title}</h3>
    {children}
  </section>
);

export default function PaceAnalyticsRankingsView({ teacher, quarter, schoolYearId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!teacher?.teacher_id) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    fetchAnalyticsReport(teacher.teacher_id, quarter, schoolYearId)
      .then((response) => { if (!cancelled) setData(response.data ?? null); })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message ?? err.message ?? "Failed to load analytics report.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacher?.teacher_id, quarter, schoolYearId]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-on-surface-variant">Loading analytics report…</div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const percentage = (value) => `${value ?? 0}%`;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 text-xs">
        <div>
          <p className="text-sm font-extrabold text-on-surface">Lifegiver Christian Academy</p>
          <p className="mt-0.5 text-on-surface-variant">{data?.quarterLabel ?? `Quarter ${quarter}`}, School Year {data?.schoolYear ?? "—"}</p>
          <p className="mt-0.5 text-on-surface-variant">Department/Grade: {data?.gradeLabel ?? "All Grades"}</p>
        </div>
        <div className="text-right">
          <p><span className="font-bold">Prepared by:</span> {data?.teacherName ?? "—"}</p>
          <p><span className="font-bold">Submitted to:</span> {data?.principalName ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-7 lg:grid-cols-2">
        <Section title="1. TOP 10 STUDENT RANKINGS" className="lg:row-span-2">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead><tr><Head className="text-center">Rank</Head><Head>Student</Head><Head className="text-center">Points</Head><Head className="text-center">Completion</Head><Head className="text-center">Status</Head></tr></thead>
              <tbody>
                {(data?.topRankings ?? []).length === 0
                  ? <EmptyRow columns={5} text="No ranking data for this quarter." />
                  : data.topRankings.map((row) => (
                    <tr key={row.rank}>
                      <Cell className="text-center font-bold">{row.rank}</Cell>
                      <Cell className="font-semibold">{row.name}</Cell>
                      <Cell className="text-center">{row.points}</Cell>
                      <Cell className="text-center">{Number(row.completionRate ?? 0).toFixed(2)}%</Cell>
                      <Cell className={`text-center font-bold ${STATUS_STYLE[row.status] ?? ""}`}>{row.status}</Cell>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="2. PERFORMANCE POINTS DISTRIBUTION">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead><tr><Head>Points Range</Head><Head className="text-center">Students</Head><Head className="text-center">Percentage</Head></tr></thead>
              <tbody>{(data?.pointsDistribution ?? []).map((row) => <tr key={row.range}><Cell>{row.range}</Cell><Cell className="text-center">{row.count}</Cell><Cell className="text-center">{percentage(row.percentage)}</Cell></tr>)}</tbody>
            </table>
          </div>
        </Section>

        <Section title="3. COMPLETION STATUS SUMMARY">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead><tr><Head>Status</Head><Head className="text-center">Students</Head><Head className="text-center">Percentage</Head></tr></thead>
              <tbody>{(data?.completionStatus ?? []).map((row) => <tr key={row.label}><Cell>{row.label}</Cell><Cell className="text-center">{row.count}</Cell><Cell className="text-center">{percentage(row.percentage)}</Cell></tr>)}</tbody>
            </table>
          </div>
        </Section>

        <Section title="4. PACE TEST READINESS SUMMARY">
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-center">
            <div className="border-r border-slate-200 p-4"><p className="text-xl font-extrabold text-green-600">{data?.readiness?.ready ?? 0}</p><p className="text-[10px] font-bold uppercase text-on-surface-variant">Ready</p></div>
            <div className="border-r border-slate-200 p-4"><p className="text-xl font-extrabold text-orange-500">{data?.readiness?.notReady ?? 0}</p><p className="text-[10px] font-bold uppercase text-on-surface-variant">Not Ready</p></div>
            <div className="p-4"><p className="text-xl font-extrabold">{data?.readiness?.total ?? 0}</p><p className="text-[10px] font-bold uppercase text-on-surface-variant">Total</p></div>
          </div>
        </Section>

        <Section title="5. STUDENTS REQUIRING INTERVENTION" className="lg:col-span-2">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse">
              <thead><tr><Head>Student</Head><Head className="text-center">Completion</Head><Head className="text-center">Points</Head><Head>Main Concern</Head></tr></thead>
              <tbody>
                {(data?.intervention ?? []).length === 0
                  ? <EmptyRow columns={4} text="No students currently require intervention." />
                  : data.intervention.map((row, index) => <tr key={`${row.name}-${index}`}><Cell className="font-semibold">{row.name}</Cell><Cell className="text-center">{Number(row.completionRate ?? 0).toFixed(2)}%</Cell><Cell className="text-center">{row.points}</Cell><Cell>{row.concern}</Cell></tr>)}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
