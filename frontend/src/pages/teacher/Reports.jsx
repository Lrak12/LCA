import { useState, useEffect } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import AttendanceReportModal from "./AttendanceReportModal.jsx";
import PaceProgressModal from "./PaceProgressModal.jsx";
import ClassAcademicRecordModal from "./ClassAcademicRecordModal.jsx";
import PaceAnalyticsRankingsModal from "./PaceAnalyticsRankingsModal.jsx";
import { fetchMySubmittedReports } from "../../api/reports.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Card preview graphics ────────────────────────────────────────────────────
const AttendancePreview = () => {
  const colors = ["bg-green-400","bg-green-400","bg-green-400","bg-gray-200","bg-green-400","bg-green-400","bg-gray-200",
                  "bg-green-400","bg-gray-200","bg-green-400","bg-green-400","bg-green-400","bg-gray-200","bg-green-400",
                  "bg-green-400","bg-green-400","bg-gray-200","bg-green-400","bg-green-400","bg-green-400","bg-gray-200",
                  "bg-gray-200","bg-green-400","bg-green-400","bg-green-400","bg-red-400","bg-gray-200","bg-green-400",
                  "bg-green-400","bg-green-400","bg-green-400","bg-gray-200","bg-green-400","bg-amber-400","bg-gray-200"];
  return (
    <div className="bg-surface-container-lowest rounded-lg p-3">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {colors.map((c, i) => <div key={i} className={`h-3 rounded-sm ${c}`} />)}
      </div>
      <p className="text-[9px] text-on-surface-variant/60 mt-2 text-center">Monthly Attendance Grid</p>
    </div>
  );
};

const PacePreview = () => {
  const matrix = [
    ["bg-green-400","bg-green-400","bg-green-400","bg-amber-400","bg-gray-200","bg-gray-200"],
    ["bg-green-400","bg-amber-400","bg-green-400","bg-gray-200","bg-gray-200","bg-gray-200"],
    ["bg-green-400","bg-green-400","bg-amber-400","bg-amber-400","bg-gray-200","bg-gray-200"],
  ];
  return (
    <div className="bg-surface-container-lowest rounded-lg p-3">
      <div className="flex flex-col gap-1 items-center">
        {matrix.map((row, ri) => (
          <div key={ri} className="flex gap-1">{row.map((c, ci) => <div key={ci} className={`w-4 h-4 rounded-full ${c}`} />)}</div>
        ))}
      </div>
      <p className="text-[9px] text-on-surface-variant/60 mt-2 text-center">PACE Progress Matrix</p>
    </div>
  );
};

const ClassGradingPreview = () => (
  <div className="bg-surface-container-lowest rounded-lg p-3">
    <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className={`h-3 rounded-sm ${i < 8 ? "bg-slate-300" : "bg-gray-200"}`} />
      ))}
    </div>
    <p className="text-[9px] text-on-surface-variant/60 mt-2 text-center">Class Grading Spreadsheet</p>
  </div>
);

const AnalyticsPreview = () => (
  <div className="bg-surface-container-lowest rounded-lg p-3 flex items-end justify-center gap-4 h-[64px]">
    <div className="flex items-end gap-1">
      <div className="w-2 h-8 rounded-sm bg-blue-400" />
      <div className="w-2 h-6 rounded-sm bg-blue-300" />
      <div className="w-2 h-4 rounded-sm bg-blue-200" />
    </div>
    <svg width="70" height="36" viewBox="0 0 70 36"><polyline points="2,30 20,22 40,14 68,4" fill="none" className="stroke-primary" strokeWidth="2" strokeLinecap="round" /></svg>
  </div>
);

// ─── Workspace card ───────────────────────────────────────────────────────────
const WorkspaceCard = ({ icon, iconBg, iconColor, title, desc, Preview, previewLabel, onOpen }) => (
  <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 hover:shadow-md transition-shadow">
    <div className="flex items-start gap-3 mb-4">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        <span className={`material-symbols-outlined text-lg ${iconColor}`} style={fillStyle}>{icon}</span>
      </span>
      <div>
        <p className="text-base font-extrabold text-on-surface">{title}</p>
        <p className="text-xs text-on-surface-variant leading-snug">{desc}</p>
      </div>
    </div>
    <Preview />
    {previewLabel && <p className="text-[10px] text-on-surface-variant/60 text-center mt-1">{previewLabel}</p>}
    <button onClick={onOpen} className="flex items-center gap-1 text-sm font-bold text-primary hover:underline mt-4">
      Open Workspace <span className="material-symbols-outlined text-base">chevron_right</span>
    </button>
  </div>
);

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const schoolYearLabel = useSchoolYear();
  const [modal, setModal] = useState(null);          // 'attendance' | 'pace' | 'academic' | 'analytics'
  const [submitted, setSubmitted] = useState([]);

  const load = () => fetchMySubmittedReports().then((res) => setSubmitted(res.data?.rows ?? [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const closeModal = () => { setModal(null); load(); };

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      {modal === "attendance" && <AttendanceReportModal onClose={closeModal} />}
      {modal === "pace"       && <PaceProgressModal onClose={closeModal} />}
      {modal === "academic"   && <ClassAcademicRecordModal onClose={closeModal} />}
      {modal === "analytics"  && <PaceAnalyticsRankingsModal onClose={closeModal} />}

      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">
        <header className="mb-8">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Reports</h2>
          <p className="text-on-surface-variant mt-1 text-sm">Generate, manage and publish academic records and report cards.</p>
        </header>

        {/* Workspace cards (2×2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
          <WorkspaceCard icon="calendar_month" iconBg="bg-blue-100" iconColor="text-blue-600"
            title="Class Attendance Report" desc="Daily and monthly attendance records"
            Preview={AttendancePreview} onOpen={() => setModal("attendance")} />
          <WorkspaceCard icon="trending_up" iconBg="bg-teal-100" iconColor="text-teal-600"
            title="PACE Progress Track Report" desc="Individual student PACE completion tracking"
            Preview={PacePreview} onOpen={() => setModal("pace")} />
          <WorkspaceCard icon="description" iconBg="bg-slate-100" iconColor="text-slate-500"
            title="Class Academic Record" desc="Class-wide performance and progress reports"
            Preview={ClassGradingPreview} onOpen={() => setModal("academic")} />
          <WorkspaceCard icon="pie_chart" iconBg="bg-purple-100" iconColor="text-purple-600"
            title="PACE Analytics & Rankings Report" desc="PACE completion analytics, rankings and performance summaries"
            Preview={AnalyticsPreview} previewLabel="Student Rankings & Completion Trend" onOpen={() => setModal("analytics")} />
        </div>

        {/* Submitted reports */}
        <section className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            <h3 className="text-xs font-extrabold tracking-widest uppercase text-on-surface">Submitted Reports</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-outline-variant/10 bg-surface-container-lowest text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
                  <th className="px-6 py-3 text-left">Report Type</th>
                  <th className="px-4 py-3 text-left">Report Title / Quarter / Month</th>
                  <th className="px-4 py-3 text-left">Student / Class</th>
                  <th className="px-4 py-3 text-left">School Year</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Published On</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {submitted.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-on-surface-variant">No reports published yet. Open a workspace and publish a report.</td></tr>
                ) : submitted.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-bold text-on-surface">
                        <span className="material-symbols-outlined text-base text-primary" style={fillStyle}>{r.report_type === "attendance" ? "calendar_month" : r.report_type === "pace" ? "trending_up" : r.report_type === "analytics" ? "leaderboard" : "description"}</span>
                        {r.typeLabel}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-on-surface-variant">{r.quarterLabel}</td>
                    <td className="px-4 py-4 text-on-surface-variant">{r.studentClass}</td>
                    <td className="px-4 py-4 text-on-surface-variant">{r.schoolYear}</td>
                    <td className="px-4 py-4"><span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{r.status}</span></td>
                    <td className="px-4 py-4 text-on-surface-variant whitespace-nowrap">{fmtDate(r.publishedOn)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setModal(r.report_type === "attendance" ? "attendance" : r.report_type === "pace" ? "pace" : r.report_type === "analytics" ? "analytics" : "academic")}
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-on-surface text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">
                          <span className="material-symbols-outlined text-sm">visibility</span> View
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant">
                          <span className="material-symbols-outlined text-base">more_vert</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </TeacherLayout>
  );
}
