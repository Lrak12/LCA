import { useState, useEffect } from "react";
import { fetchPaceReport } from "../../api/reports.js";

const STATUS_COLOR = {
  completed:    "text-green-600",
  ongoing:      "text-orange-500",
  "not-started":"text-slate-400",
};

const TH = ({ children, rowSpan, colSpan, className = "", narrow }) => (
  <th
    rowSpan={rowSpan}
    colSpan={colSpan}
    className={`border border-slate-200 px-1.5 py-2 text-center text-[9px] font-extrabold uppercase tracking-wide text-on-surface-variant bg-slate-50 ${narrow ? "whitespace-nowrap" : ""} ${className}`}
  >
    {children}
  </th>
);

const TD = ({ children, className = "" }) => (
  <td className={`border border-slate-200 px-1.5 py-2 text-center text-[11px] font-bold ${className}`}>
    {children}
  </td>
);

const SkeletonRow = ({ cols }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="border border-slate-200 px-2 py-3">
        <div className="h-3 bg-slate-100 rounded animate-pulse" />
      </td>
    ))}
  </tr>
);

export function PaceProgressContent({ teacher, quarter }) {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");

  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";

  useEffect(() => {
    if (!teacher?.teacher_id) return;
    setLoading(true);
    fetchPaceReport(teacher.teacher_id, quarter)
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [teacher?.teacher_id, quarter]);

  const subjects = report?.subjects ?? [];
  const students = (report?.students ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalCols = 1 + subjects.length * 2 + 1; // name + (range+count)*subjects + total

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* Report info + legend + search */}
      <div className="flex items-start justify-between mb-4 text-xs gap-4 flex-wrap">
        {!loading && report ? (
          <div>
            <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
            <p className="text-on-surface-variant mt-0.5">{report.quarterLabel}, School Year {report.schoolYear}</p>
            <p className="text-on-surface-variant">Supervisor: {teacherName}</p>
          </div>
        ) : <div />}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Ongoing</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Not Started</span>
          </div>
          <div className="relative shrink-0">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: 15 }}>search</span>
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
          </div>
        </div>
      </div>

      {/* ── PACE Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <TH rowSpan={2} className="text-left px-3 min-w-[150px]">Student Name</TH>
                  {subjects.map((s) => <TH key={s} colSpan={2}>{s}</TH>)}
                  <TH rowSpan={2}>Total</TH>
                </tr>
                <tr>
                  {subjects.map((s) => (
                    <>
                      <TH key={`${s}-range`} narrow>PACE Nos.</TH>
                      <TH key={`${s}-count`} narrow># of PACEs</TH>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={totalCols} />)
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="px-4 py-8 text-center text-sm text-on-surface-variant border border-slate-200">
                      {search ? "No students match your search." : "No students found for this teacher's sections."}
                    </td>
                  </tr>
                ) : students.map((student, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="border border-slate-200 px-3 py-2.5 text-xs font-bold text-on-surface text-left whitespace-nowrap">
                      {student.name}
                    </td>
                    {student.subjects.map((pace, pi) => (
                      <>
                        <TD key={`${i}-${pi}-r`} className={STATUS_COLOR[pace.status] ?? "text-slate-400"}>
                          {pace.range}
                        </TD>
                        <TD key={`${i}-${pi}-c`} className="text-on-surface">
                          {pace.count > 0 ? pace.count : "—"}
                        </TD>
                      </>
                    ))}
                    <TD className="font-extrabold text-on-surface">{student.total}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </>
  );
}

export default function PaceProgressViewModal({ teacher, quarter, onClose }) {
  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">PACE Progress Track</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Quarterly class pacing and progress monitoring · {teacherName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <PaceProgressContent teacher={teacher} quarter={quarter} />
        </div>
      </div>
    </div>
  );
}
