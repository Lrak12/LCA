// Supervisor Report viewer (principal): opened from Reports.jsx "View Report". Wraps the
// three report bodies in tabs; each tab's content lives in its own *ViewModal file and is
// re-exported here as a *Content component.
// No backend call of its own - each tab's data is fetched inside its *ViewModal file:
//   Academic  -> ClassAcademicRecordViewModal.jsx  (GET /reports/teacher/:id/academic)
//   Attendance-> AttendanceReportViewModal.jsx      (GET /reports/teacher/:id/attendance)
//   PACE      -> PaceProgressViewModal.jsx          (GET /reports/teacher/:id/pace)
import { useState } from "react";
import { ClassAcademicRecordContent } from "./ClassAcademicRecordViewModal.jsx";
import { AttendanceReportContent } from "./AttendanceReportViewModal.jsx";
import { PaceProgressContent } from "./PaceProgressViewModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const QUARTER_LABELS = { 1: "1st Quarter", 2: "2nd Quarter", 3: "3rd Quarter", 4: "4th Quarter" };

// the report tabs (analytics is a placeholder)
const TABS = [
  { key: "academic",   label: "Class Academic Record Summary", icon: "menu_book"       },
  { key: "attendance", label: "Attendance Summary Report",     icon: "event_available" },
  { key: "pace",       label: "PACE Progress Summary Report",  icon: "bar_chart"       },
  { key: "analytics",  label: "PACE Analytics and Ranking Report", icon: "leaderboard" },
];

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const SummaryCell = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{label}</p>
    <div className="text-sm font-bold text-on-surface mt-0.5 truncate">{children}</div>
  </div>
);

export default function SupervisorReportModal({
  teacher,
  quarter,
  gradeRange,
  submittedAt,
  status = "Submitted",
  initialTab = "academic",
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // which report tab is showing
  const teacherName  = teacher ? `${teacher.firstName} ${teacher.lastName}` : "—";
  const quarterLabel = QUARTER_LABELS[quarter] ?? `Quarter ${quarter}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col max-h-[94vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-5 pb-4 border-b border-outline-variant/20 shrink-0">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Supervisor Academic Report</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Submitted by {teacherName} — {quarterLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-7 py-4 bg-surface-container-lowest border-b border-outline-variant/10 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-start">
            <SummaryCell label="Supervisor">{teacherName}</SummaryCell>
            <SummaryCell label="Assigned Grade Level(s)">{gradeRange ?? "—"}</SummaryCell>
            <SummaryCell label="Quarter">{quarterLabel}</SummaryCell>
            <SummaryCell label="Submission Date">
              {submittedAt ? (
                <>
                  {formatDate(submittedAt)}
                  <span className="block text-[11px] font-normal text-on-surface-variant">{formatTime(submittedAt)}</span>
                </>
              ) : "—"}
            </SummaryCell>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Status</p>
              <span className={`inline-block mt-1 text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                status === "Submitted" ? "bg-emerald-100 text-emerald-700"
                : status === "Partial" ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-500"
              }`}>
                {status}
              </span>
            </div>
          </div>
        </div>

        {/* Report preview */}
        <div className="px-7 pt-4 shrink-0">
          <p className="text-sm font-extrabold text-on-surface mb-3">Report Preview</p>
          {/* report tabs -> setActiveTab(key) switches which *Content component renders below */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-t-xl whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-surface-container-low text-on-surface-variant border-transparent hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm" style={active ? fillStyle : undefined}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active report body — renders the content module for the selected tab */}
        <div className="flex-1 overflow-auto px-7 py-5 border-t border-outline-variant/15">
          {activeTab === "academic"   && <ClassAcademicRecordContent teacher={teacher} quarter={quarter} />}
          {activeTab === "attendance" && <AttendanceReportContent teacher={teacher} quarter={quarter} />}
          {activeTab === "pace"       && <PaceProgressContent teacher={teacher} quarter={quarter} />}
          {activeTab === "analytics"  && (
            <div className="border-2 border-dashed border-outline-variant/30 rounded-2xl py-24 flex items-center justify-center">
              <p className="text-sm text-on-surface-variant italic">Report content preview will render here…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-4 border-t border-outline-variant/20 bg-surface-container-lowest shrink-0">
          {/* Download PDF -> window.print() (browser print-to-PDF; no backend) */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl px-5 py-2.5 hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="text-sm font-bold text-white bg-primary rounded-xl px-6 py-2.5 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
