// Attendance Report (principal): monthly present/absent/tardy grid per student, plus
// demerits + homework PACEs. Exports AttendanceReportContent (embedded in
// SupervisorReportModal) + a standalone modal.
// Backend chain (frontend api/reports.js fetchAttendanceReport -> routes/reports.routes.js):
//   GET /reports/teacher/:id/attendance -> controllers/reports.controller.js > getTeacherAttendanceReport (~line 23)
//                                        -> services/reports.service.js > getTeacherAttendanceReport (~line 384)
// What the backend computes (this table just renders it): getTeacherAttendanceReport reads the
// attendance rows for the quarter's date range (only up to today) and, per student per month,
// tallies Present / Absent / Tardy counts. `months` = the quarter's month headers. Demerits +
// homework-PACE columns are placeholders (not yet tracked).
import { useState, useEffect } from "react";
import { fetchAttendanceReport } from "../../api/reports.js";

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
        <div className="h-3 bg-slate-100 rounded animate-pulse" />
      </td>
    ))}
  </tr>
);

// Embeddable report body (used standalone below and inside SupervisorReportModal)
export function AttendanceReportContent({ teacher, quarter, schoolYearId }) {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");           // student name filter

  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";

  // fetch this teacher's attendance report for the quarter
  useEffect(() => {
    if (!teacher?.teacher_id) return;
    setLoading(true);
    fetchAttendanceReport(teacher.teacher_id, quarter, schoolYearId)
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [teacher?.teacher_id, quarter, schoolYearId]);

  const students = (report?.students ?? []).filter((s) => // rows filtered by the search box
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const months = report?.months ?? [];                  // month column headers (P/A/T each)
  const totalCols = 3 + months.length * 3;              // name + demerits + hw, plus 3 cols per month

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      <div className="flex items-start justify-between mb-4 text-xs gap-4">
        {!loading && report ? (
          <div>
            <p className="font-extrabold text-on-surface text-sm">Lifegiver Christian Academy</p>
            <p className="text-on-surface-variant mt-0.5">{report.quarterLabel}, School Year {report.schoolYear}</p>
            <p className="text-on-surface-variant">Supervisor: {teacherName}</p>
          </div>
        ) : <div />}
        <div className="relative shrink-0">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: 15 }}>search</span>
          {/* search -> setSearch filters the `students` rows client-side */}
          <input
            type="text"
            placeholder="Search student..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
          />
        </div>
      </div>

      {/* ── Attendance Table ─────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TH rowSpan={3} className="text-left px-3 min-w-[160px]">Student Name</TH>
                  <TH colSpan={months.length * 3}>Attendance</TH>
                  <TH rowSpan={3} className="min-w-[70px]">No. of<br />Demerits</TH>
                  <TH rowSpan={3} className="min-w-[70px]">HW<br />PACEs</TH>
                </tr>
                <tr>
                  {months.map((m) => <TH key={m} colSpan={3}>{m}</TH>)}
                </tr>
                <tr>
                  {months.map((m) => (
                    ["P","A","T"].map((h) => <TH key={`${m}-${h}`}>{h}</TH>)
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={totalCols} />)
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="px-4 py-8 text-center text-sm text-on-surface-variant border border-slate-200">
                      {search ? "No students match your search." : "No attendance records found for this teacher."}
                    </td>
                  </tr>
                ) : students.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <TD align="left" className="px-3 font-bold text-on-surface">{s.name}</TD>
                    {s.months.map((m, mi) => (
                      <>
                        <TD key={`${i}-${mi}-p`} className="text-on-surface">{m.present}</TD>
                        <TD key={`${i}-${mi}-a`} className={m.absent > 0 ? "text-orange-500" : "text-on-surface"}>{m.absent}</TD>
                        <TD key={`${i}-${mi}-t`} className={m.tardy  > 0 ? "text-orange-500" : "text-on-surface"}>{m.tardy}</TD>
                      </>
                    ))}
                    <TD className="text-pink-500 font-extrabold">{s.demerits}</TD>
                    <TD className="text-purple-600 font-extrabold">{s.hw}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
    </>
  );
}

// Standalone modal wrapper around the content body
export default function AttendanceReportViewModal({ teacher, quarter, onClose }) {
  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1060px] my-4 flex flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Attendance Report</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Monthly attendance tracking · {teacherName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <AttendanceReportContent teacher={teacher} quarter={quarter} />
        </div>
      </div>
    </div>
  );
}
