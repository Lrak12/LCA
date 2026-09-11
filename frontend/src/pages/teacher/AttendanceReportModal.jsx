import { useState, useEffect } from "react";
import { fetchMyAttendanceReport } from "../../api/teacher.js";
import { submitReport } from "../../api/reports.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const QUARTERS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

const TH = ({ children, rowSpan, colSpan, className = "" }) => (
  <th
    rowSpan={rowSpan}
    colSpan={colSpan}
    className={`border border-slate-200 px-2 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant bg-slate-50 ${className}`}
  >
    {children}
  </th>
);

const TD = ({ children, className = "", align = "center" }) => (
  <td className={`border border-slate-200 px-2 py-2.5 text-xs font-bold text-${align} ${className}`}>
    {children}
  </td>
);

const SkeletonRow = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="border border-slate-200 px-2 py-3">
        <div className="animate-pulse bg-slate-200 rounded h-3 w-full" />
      </td>
    ))}
  </tr>
);

export default function AttendanceReportModal({ onClose }) {
  const [quarter,     setQuarter]     = useState(4);
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
    fetchMyAttendanceReport(quarter)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [quarter]);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishErr("");
    setPublished(false);
    try {
      await submitReport("attendance", quarter);
      setPublished(true);
    } catch (err) {
      setPublishErr(err.message ?? "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const months   = data?.months   ?? [];
  const students = (data?.students ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );
  const teacherName = data?.teacherName ?? "—";
  const schoolYear  = data?.schoolYear  ?? "—";
  const today = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

  const totalCols = 1 + months.length * 3 + 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Attendance Report</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Monthly attendance tracking with tardiness, absences, demerits and homework monitoring.
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

          {/* Quarter selector */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  quarter === q ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Q{q}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="flex items-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors rounded-lg px-3 py-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Export PDF
            </button>
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}
        {published && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Attendance report submitted for all four quarters. The principal can now view it.
          </div>
        )}
        {publishErr && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {publishErr}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-6 py-4">

          {/* Report info */}
          <div className="flex items-start justify-between mb-5 text-xs">
            <div>
              <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
              <p className="text-on-surface-variant mt-0.5">{QUARTERS[quarter - 1]}, School Year {schoolYear}</p>
            </div>
            <div className="text-right">
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
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TH rowSpan={3} className="text-left px-3 min-w-[160px]">Student Name</TH>
                  <TH colSpan={months.length * 3}>Attendance</TH>
                  <TH rowSpan={3} className="min-w-[70px]">No. of<br />Demerits</TH>
                  <TH rowSpan={3} className="min-w-[70px]">No. of<br />Days HW</TH>
                </tr>
                <tr>
                  {months.map((m) => <TH key={m} colSpan={3}>{m}</TH>)}
                </tr>
                <tr>
                  {months.map((m) => (
                    ["P", "A", "T"].map((h) => <TH key={`${m}-${h}`}>{h}</TH>)
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={totalCols} />)
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="px-4 py-10 text-center text-sm text-on-surface-variant border border-slate-200">
                      {data?.students?.length === 0 ? "No attendance records found for this quarter." : "No students match the search."}
                    </td>
                  </tr>
                ) : (
                  students.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <TD align="left" className="px-3 font-bold text-on-surface">{s.name}</TD>

                      {(s.months ?? []).map((m) => (
                        <>
                          <TD key={`${m.month}-p`} className="text-on-surface">{m.present}</TD>
                          <TD key={`${m.month}-a`} className={m.absent > 0 ? "text-orange-500" : "text-on-surface"}>{m.absent}</TD>
                          <TD key={`${m.month}-t`} className={m.tardy  > 0 ? "text-orange-500" : "text-on-surface"}>{m.tardy}</TD>
                        </>
                      ))}

                      <TD className="text-pink-500 font-extrabold">{s.demerits ?? 0}</TD>
                      <TD className="text-purple-600 font-extrabold">{s.hw ?? 0}</TD>
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
            {publishing ? "Publishing…" : published ? "Publish Again" : "Publish to Principal"}
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
