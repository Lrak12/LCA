// Class Academic Record report (principal): the class-wide quarterly academic summary
// table (PACEs, 100's, attendance, scriptures). Exports ClassAcademicRecordContent (the
// body, embedded in SupervisorReportModal) + a standalone modal wrapper.
// Backend chain (frontend api/reports.js fetchAcademicReport -> routes/reports.routes.js):
//   GET /reports/teacher/:id/academic -> controllers/reports.controller.js > getTeacherAcademicReport (~line 16)
//                                      -> services/reports.service.js > getTeacherAcademicReport (~line 295)
// What the backend computes per student (this table just renders it): the heavy lifting is in
// reports.service.js > computeAcademicMetrics (~line 186), which for the quarter derives:
//   paces = # PACEs completed, cum/ave = average score, h100/cum100 = count of 100s (quarter
//   + cumulative), hr = honor-roll grade, tard/abs = tardies/absences, days = homework days.
import { useState, useEffect } from "react";
import { fetchAcademicReport } from "../../api/reports.js";

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
    {Array.from({ length: 12 }).map((_, i) => (
      <td key={i} className="border border-slate-200 px-2 py-3">
        <div className="h-3 bg-slate-100 rounded animate-pulse" />
      </td>
    ))}
  </tr>
);

// Embeddable report body (used standalone below and inside SupervisorReportModal)
export function ClassAcademicRecordContent({ teacher, quarter, schoolYearId }) {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";

  // fetch this teacher's academic report for the quarter (re-runs if either changes)
  useEffect(() => {
    if (!teacher?.teacher_id) return;
    // This effect owns the report request lifecycle for the selected quarter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchAcademicReport(teacher.teacher_id, quarter, schoolYearId)
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [teacher?.teacher_id, quarter, schoolYearId]);

  const students = report?.students ?? [];             // one row per student

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* ── Report info block ──────────────────────────────────────── */}
      {!loading && report && (
        <div className="flex items-start justify-between mb-5 text-xs gap-4">
          <div>
            <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
            <p className="text-on-surface-variant mt-0.5">{report.quarterLabel}, School Year {report.schoolYear}</p>
            <p className="text-on-surface-variant">Supervisor: {teacherName}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-2">
              <span className="font-bold text-on-surface">Section(s):</span>
              <span className="text-on-surface">
                {report.sections?.length ? report.sections.map(s => s.section_name).join(", ") : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Class Academic Table ────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm min-w-[860px]">
              <thead>
                <tr>
                  <TH rowSpan={3} className="text-left px-3 min-w-[160px] bg-slate-50 text-on-surface-variant">
                    NAMES
                  </TH>
                  <TH colSpan={5} className="bg-slate-50 text-on-surface-variant">TOTAL</TH>
                  <TH rowSpan={2} className="bg-red-50 text-red-700 min-w-[40px]">HR</TH>
                  <TH rowSpan={2} className="bg-amber-50 text-amber-700 min-w-[44px]">Tard.</TH>
                  <TH rowSpan={2} className="bg-orange-50 text-orange-700 min-w-[40px]">Abs.</TH>
                  <TH rowSpan={2} className="bg-purple-50 text-purple-700 min-w-[72px]">No. of Days</TH>
                  <TH colSpan={2} className="bg-green-50 text-green-700">1st to Recite Monthly Scriptures</TH>
                </tr>
                <tr>
                  <TH className="bg-slate-50 text-on-surface-variant">PACE's</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Cum.</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">100's</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Cum.</TH>
                  <TH className="bg-slate-50 text-on-surface-variant">Ave.</TH>
                  <TH className="bg-green-50 text-green-700 min-w-[160px]">1st Script.</TH>
                  <TH className="bg-green-50 text-green-700 min-w-[160px]">2nd Script.</TH>
                </tr>
                <tr>
                  {[...Array(5)].map((_, i) => (
                    <td key={i} className="border border-slate-200 bg-slate-50 py-1" />
                  ))}
                  <TH className="bg-red-50 text-red-500 text-[9px]">A/B</TH>
                  <TH className="bg-amber-50 text-amber-500 text-[9px]">#</TH>
                  <TH className="bg-orange-50 text-orange-500 text-[9px]">#</TH>
                  <TH className="bg-purple-50 text-purple-500 text-[9px]">No Homework</TH>
                  <td className="border border-slate-200 bg-green-50 py-1" />
                  <td className="border border-slate-200 bg-green-50 py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-on-surface-variant border border-slate-200">
                      No students found for this teacher's sections.
                    </td>
                  </tr>
                ) : (
                  students.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                      <TD className="text-left px-3 font-bold text-on-surface">{s.name}</TD>
                      <TD className="font-bold text-on-surface">{s.paces}</TD>
                      <TD className="text-on-surface">{s.cum}</TD>
                      <TD className="font-extrabold text-green-600">{s.h100}</TD>
                      <TD className="text-on-surface">{s.cum100}</TD>
                      <TD className="font-bold text-on-surface">{s.ave > 0 ? `${s.ave}%` : "—"}</TD>
                      <TD className="font-bold text-on-surface">{s.hr || "—"}</TD>
                      <TD className={s.tard > 0 ? "font-bold text-orange-500" : "text-on-surface"}>{s.tard}</TD>
                      <TD className={s.abs  > 0 ? "font-bold text-orange-500" : "text-on-surface"}>{s.abs}</TD>
                      <TD className="font-extrabold text-purple-600">{s.days}</TD>
                      <TD>
                        <span className="block max-w-[170px] whitespace-pre-wrap break-words text-left text-[11px] font-semibold text-green-800">
                          {s.s1 || "—"}
                        </span>
                      </TD>
                      <TD>
                        <span className="block max-w-[170px] whitespace-pre-wrap break-words text-left text-[11px] font-semibold text-green-800">
                          {s.s2 || "—"}
                        </span>
                      </TD>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
    </>
  );
}

// Standalone modal wrapper around the content body (used when opened on its own)
export default function ClassAcademicRecordViewModal({ teacher, quarter, onClose }) {
  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Class Academic Record</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Class-wide quarterly academic performance summary · {teacherName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          <ClassAcademicRecordContent teacher={teacher} quarter={quarter} />
        </div>
      </div>
    </div>
  );
}
