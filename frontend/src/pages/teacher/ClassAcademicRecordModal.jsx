import { useState, useEffect } from "react";
import { fetchMyAcademicReport } from "../../api/teacher.js";
import { submitReport } from "../../api/reports.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const TH = ({ children, rowSpan, colSpan, className = "" }) => (
  <th
    rowSpan={rowSpan}
    colSpan={colSpan}
    className={`border border-slate-300 px-2 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-wide ${className}`}
  >
    {children}
  </th>
);

const TD = ({ children, className = "" }) => (
  <td className={`border border-slate-200 px-2 py-2 text-xs text-center ${className}`}>
    {children}
  </td>
);

const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 13 }).map((_, i) => (
      <td key={i} className="border border-slate-200 px-2 py-3">
        <div className="animate-pulse bg-slate-200 rounded h-3 w-full" />
      </td>
    ))}
  </tr>
);

export default function ClassAcademicRecordModal({ onClose }) {
  const [quarter,     setQuarter]     = useState(1);
  const [search,      setSearch]      = useState("");
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [publishing,  setPublishing]  = useState(false);
  const [published,   setPublished]   = useState(false);
  const [publishErr,  setPublishErr]  = useState("");

  useEffect(() => {
    // This effect owns the request lifecycle whenever the selected quarter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setPublished(false);
    setPublishErr("");
    fetchMyAcademicReport(quarter)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message ?? "Failed to load report."))
      .finally(() => setLoading(false));
  }, [quarter]);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishErr("");
    setPublished(false);
    try {
      await submitReport("academic", quarter);
      setPublished(true);
    } catch (err) {
      setPublishErr(err.message ?? "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const teacherName  = data?.teacherName  ?? "—";
  const schoolYear   = data?.schoolYear   ?? "—";
  const quarterLabel = data?.quarterLabel ?? `Quarter ${quarter}`;
  const today = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

  const students = (data?.students ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Class Academic Record</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Class-wide quarterly academic performance summary.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-outline-variant/10 flex-wrap">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1 text-on-surface-variant" style={{ fontSize: 16 }}>search</span>
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm bg-white border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="flex items-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors rounded-lg px-3 py-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Export PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}
        {published && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Academic record submitted for all four quarters. The principal can now view it.
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

          {/* Report info */}
          <div className="flex flex-wrap items-end justify-between mb-5 text-xs gap-4">
            <div>
              <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
              <p className="text-on-surface-variant mt-0.5">{quarterLabel}, School Year {schoolYear}</p>
            </div>

            <div aria-label="Academic report quarter">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                Quarter
              </span>
              <div className="inline-flex rounded-xl bg-surface-container-low p-1">
                {[1, 2, 3, 4].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuarter(q)}
                    aria-pressed={quarter === q}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      quarter === q
                        ? "bg-primary text-white shadow-sm"
                        : "text-on-surface-variant hover:bg-white hover:text-on-surface"
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-on-surface-variant">
                <span className="font-bold text-on-surface">Prepared by:</span> {teacherName}
              </p>
              <p className="text-on-surface-variant mt-0.5">
                <span className="font-bold text-on-surface">Date:</span> {today}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm min-w-[860px]">
              <thead>
                <tr>
                  <TH rowSpan={3} className="text-left px-3 min-w-[160px] bg-slate-50 text-on-surface-variant">NAMES</TH>
                  <TH colSpan={5} className="bg-slate-50 text-on-surface-variant">TOTAL</TH>
                  <TH rowSpan={2} className="bg-red-50 text-red-700 min-w-[40px]">HR</TH>
                  <TH rowSpan={2} className="bg-amber-50 text-amber-700 min-w-[44px]">Tard.</TH>
                  <TH rowSpan={2} className="bg-orange-50 text-orange-700 min-w-[40px]">Abs.</TH>
                  <TH rowSpan={2} className="bg-pink-50 text-pink-700 min-w-[46px]">Dmts.</TH>
                  <TH rowSpan={2} className="bg-purple-50 text-purple-700 min-w-[56px]"># Days</TH>
                  <TH colSpan={2} className="bg-green-50 text-green-700">1st to Recite Monthly Scriptures</TH>
                </tr>
                <tr>
                  <TH className="bg-slate-50 text-on-surface-variant">PACE's</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Cum.</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">100's</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Cum.</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Ave.</TH>
                  <TH className="bg-green-50 text-green-700">1st Script.</TH>
                  <TH className="bg-green-50 text-green-700">2nd Script.</TH>
                </tr>
                <tr>
                  {[...Array(5)].map((_, i) => (
                    <td key={i} className="border border-slate-200 bg-slate-50 py-1" />
                  ))}
                  <TH className="bg-red-50 text-red-500 text-[9px]">A/B</TH>
                  <TH className="bg-amber-50 text-amber-500 text-[9px]">#</TH>
                  <TH className="bg-orange-50 text-orange-500 text-[9px]">#</TH>
                  <TH className="bg-pink-50 text-pink-500 text-[9px]">#</TH>
                  <TH className="bg-purple-50 text-purple-500 text-[9px]">No Hmwrk</TH>
                  <td className="border border-slate-200 bg-green-50 py-1" />
                  <td className="border border-slate-200 bg-green-50 py-1" />
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-10 text-center text-sm text-on-surface-variant border border-slate-200">
                      {data?.students?.length === 0 ? "No academic data found for this quarter." : "No students match the search."}
                    </td>
                  </tr>
                ) : (
                  students.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                      <TD className="text-left px-3 font-bold text-on-surface">{s.name}</TD>
                      <TD className="font-bold text-on-surface">{s.paces || "—"}</TD>
                      <TD className="text-on-surface">{s.cum || "—"}</TD>
                      <TD className="font-extrabold text-green-600">{s.h100 || "—"}</TD>
                      <TD className="text-on-surface">{s.cum100 || "—"}</TD>
                      <TD className="font-bold text-on-surface">{s.ave ? `${s.ave}%` : "—"}</TD>
                      <TD className="font-bold text-on-surface">{s.hr ?? "—"}</TD>
                      <TD className={s.tard > 0 ? "font-bold text-orange-500" : "text-on-surface"}>{s.tard ?? 0}</TD>
                      <TD className={s.abs > 0 ? "font-bold text-orange-500" : "text-on-surface"}>{s.abs ?? 0}</TD>
                      <TD className="font-extrabold text-pink-600">{s.dmts ?? 0}</TD>
                      <TD className="font-extrabold text-purple-600">{s.days ?? 0}</TD>
                      <TD>
                        {s.s1 && <span className="material-symbols-outlined text-green-500 text-base" style={fillStyle}>check</span>}
                      </TD>
                      <TD>
                        {s.s2 && <span className="material-symbols-outlined text-green-500 text-base" style={fillStyle}>check</span>}
                      </TD>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button
            onClick={handlePublish}
            disabled={publishing || loading}
            className="flex items-center gap-2 text-sm font-bold text-white bg-primary rounded-xl px-5 py-2.5 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base" style={fillStyle}>
              {publishing ? "hourglass_top" : "publish"}
            </span>
            {publishing ? "Publishing…" : published ? "Publish Again" : "Publish to Admin"}
          </button>
          <button className="flex items-center gap-2 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl px-5 py-2.5 hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-base">print</span>
            Print
          </button>
        </div>

      </div>
    </div>
  );
}
