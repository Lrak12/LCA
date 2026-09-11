import { useState, useEffect } from "react";
import { fetchPaceAnalyticsReport } from "../../api/teacher.js";
import { submitReport } from "../../api/reports.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const QUARTERS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const pct = (n) => `${(n ?? 0)}%`;

const STATUS_STYLE = {
  "On Track":          "text-green-600",
  "Ongoing":           "text-orange-500",
  "Needs Intervention": "text-red-500",
};

// ── Section heading ──────────────────────────────────────────────────────────
const SectionTitle = ({ n, children }) => (
  <h3 className="text-[13px] font-extrabold text-on-surface mb-2.5">
    {n}. {children}
  </h3>
);

// ── Generic report table ─────────────────────────────────────────────────────
const Th = ({ children, className = "" }) => (
  <th className={`border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant ${className}`}>
    {children}
  </th>
);
const Td = ({ children, className = "" }) => (
  <td className={`border border-slate-200 px-3 py-2.5 text-xs text-on-surface ${className}`}>
    {children}
  </td>
);

export default function PaceAnalyticsRankingsModal({ onClose }) {
  const grade = "all";
  const quarter = 4;
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [status,    setStatus]    = useState("Draft");   // Draft | Published
  const [savedAt,   setSavedAt]   = useState(null);
  const [busy,      setBusy]      = useState("");          // "save" | "publish"
  const [publishErr, setPublishErr] = useState("");

  useEffect(() => {
    // This effect owns the initial request lifecycle for the fixed whole-year report.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setStatus("Draft");
    setSavedAt(null);
    setPublishErr("");
    fetchPaceAnalyticsReport({ grade, quarter })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load report."))
      .finally(() => setLoading(false));
  }, [grade, quarter]);

  const stamp = () =>
    new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const handleSaveDraft = () => {
    setBusy("save");
    setTimeout(() => { setStatus("Draft"); setSavedAt(stamp()); setBusy(""); }, 350);
  };
  const handlePublish = async () => {
    setBusy("publish");
    setPublishErr("");
    try {
      await submitReport("analytics", quarter);
      setStatus("Published");
      setSavedAt(stamp());
    } catch (err) {
      setPublishErr(
        err.response?.data?.message ?? err.message ?? "Failed to publish. Please try again."
      );
    } finally {
      setBusy("");
    }
  };

  const today = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  const schoolYear  = data?.schoolYear  ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[980px] my-4 flex flex-col">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">PACE Analytics &amp; Rankings Report</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              PACE completion analytics, rankings and performance summaries.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${status === "Published" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {status}
            </span>
            {savedAt && <span className="text-[11px] text-on-surface-variant">Last saved: {savedAt}</span>}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}
        {status === "Published" && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            PACE analytics and rankings report submitted for all four quarters. The principal can now view it.
          </div>
        )}
        {publishErr && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {publishErr}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {loading ? (
            <div className="py-20 text-center text-sm text-on-surface-variant">
              <span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" />
              <span className="ml-2 align-middle">Loading report…</span>
            </div>
          ) : (
            <>
              {/* Report letterhead */}
              <div className="flex items-start justify-between mb-6 text-xs">
                <div>
                  <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
                  <p className="text-on-surface-variant mt-0.5">{QUARTERS[quarter - 1]}, School Year {schoolYear}</p>
                  <p className="text-on-surface-variant mt-0.5">Department/Grade: {data?.gradeLabel ?? "—"}</p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-on-surface-variant"><span className="font-bold text-on-surface">Prepared by:</span> {data?.teacherName ?? "—"}</p>
                  <p className="text-on-surface-variant"><span className="font-bold text-on-surface">Submitted to:</span> {data?.principalName ?? "—"}</p>
                  <p className="text-on-surface-variant"><span className="font-bold text-on-surface">Date:</span> {today}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-7">

                {/* 1. Eligible student rankings */}
                <section className="lg:row-span-2">
                  <SectionTitle n={1}>STUDENT RANKINGS</SectionTitle>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th className="text-center w-10">Rank</Th>
                          <Th>Student Name</Th>
                          <Th className="text-center">Performance Points</Th>
                          <Th className="text-center">Completion Rate</Th>
                          <Th className="text-center">Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.topRankings ?? []).length === 0 ? (
                          <tr><td colSpan={5} className="border border-slate-200 px-3 py-8 text-center text-xs text-on-surface-variant">No eligible students with an assigned PACE and a recorded test score.</td></tr>
                        ) : data.topRankings.map((r) => (
                          <tr key={r.rank}>
                            <Td className="text-center font-bold">{r.rank}</Td>
                            <Td className="font-semibold">{r.name}</Td>
                            <Td className="text-center">{r.points}</Td>
                            <Td className="text-center">{r.completionRate.toFixed(2)}%</Td>
                            <Td className={`text-center font-bold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 2. Performance points distribution */}
                <section>
                  <SectionTitle n={2}>PERFORMANCE POINTS DISTRIBUTION</SectionTitle>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Points Range</Th>
                          <Th className="text-center">No. of Students</Th>
                          <Th className="text-center">Percentage</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.pointsDistribution ?? []).map((r) => (
                          <tr key={r.range}>
                            <Td>{r.range}</Td>
                            <Td className="text-center">{r.count}</Td>
                            <Td className="text-center">{pct(r.percentage)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 3. Completion status summary */}
                <section>
                  <SectionTitle n={3}>COMPLETION STATUS SUMMARY</SectionTitle>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Status</Th>
                          <Th className="text-center">No. of Students</Th>
                          <Th className="text-center">Percentage</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.completionStatus ?? []).map((r) => (
                          <tr key={r.label}>
                            <Td>
                              <span className="inline-flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ background: r.dot }} />
                                {r.label}
                              </span>
                            </Td>
                            <Td className="text-center">{r.count}</Td>
                            <Td className="text-center">{pct(r.percentage)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 4. PACE test readiness summary */}
                <section>
                  <SectionTitle n={4}>PACE TEST READINESS SUMMARY</SectionTitle>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Category</Th>
                          <Th className="text-center">No. of Students</Th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <Td><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" />Ready for PACE Test</span></Td>
                          <Td className="text-center">{data?.readiness?.ready ?? 0}</Td>
                        </tr>
                        <tr>
                          <Td><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" />Not Yet Ready</span></Td>
                          <Td className="text-center">{data?.readiness?.notReady ?? 0}</Td>
                        </tr>
                        <tr className="bg-slate-50">
                          <Td className="font-extrabold uppercase text-[11px]">Total</Td>
                          <Td className="text-center font-extrabold">{data?.readiness?.total ?? 0}</Td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 5. Students requiring intervention */}
                <section className="lg:col-span-2">
                  <SectionTitle n={5}>STUDENTS REQUIRING INTERVENTION</SectionTitle>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Student Name</Th>
                          <Th className="text-center">Completion Rate</Th>
                          <Th className="text-center">Performance Points</Th>
                          <Th>Main Concern</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.intervention ?? []).length === 0 ? (
                          <tr><td colSpan={4} className="border border-slate-200 px-3 py-8 text-center text-xs text-on-surface-variant">No students currently require intervention.</td></tr>
                        ) : data.intervention.map((r, i) => (
                          <tr key={i}>
                            <Td className="font-semibold">{r.name}</Td>
                            <Td className="text-center">{r.completionRate.toFixed(2)}%</Td>
                            <Td className="text-center">{r.points}</Td>
                            <Td className="text-on-surface-variant">{r.concern}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={handleSaveDraft}
            disabled={!!busy || loading}
            className="flex items-center gap-2 text-sm font-bold text-green-600 border border-green-200 rounded-xl px-5 py-2.5 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">save</span>
            {busy === "save" ? "Saving…" : "Save Draft"}
          </button>
          <button
            onClick={handlePublish}
            disabled={!!busy || loading}
            className="flex items-center gap-2 text-sm font-bold text-white bg-primary rounded-xl px-5 py-2.5 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base" style={fillStyle}>publish</span>
            {busy === "publish" ? "Publishing…" : status === "Published" ? "Publish Again" : "Publish to Principal"}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl px-5 py-2.5 hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">print</span>
            Print
          </button>
        </div>

      </div>
    </div>
  );
}
