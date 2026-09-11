// Supervisor Academic Reports (principal): combined all-quarter status showing which
// supervisors submitted each report type; "View Report" owns the quarter filter.
// Backend chain (frontend api/reports.js -> routes/reports.routes.js):
//   teachers:    GET /reports/teachers    -> controllers/reports.controller.js > getTeachers (~line 11)            -> services/reports.service.js > getTeachers (~line 152)
//   submissions: GET /reports/submissions -> controllers/reports.controller.js > getSubmissionStatuses (~line 78) -> services/reports.service.js > getSubmissionStatuses (~line 584)
import { useState, useEffect } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchReportSchoolYears, fetchReportTeachers, fetchAllSubmissionStatuses } from "../../api/reports.js";
import SupervisorReportModal from "./SupervisorReportModal.jsx";

// report types each supervisor is expected to submit
const REPORT_TYPES = [
  { key: "academic",   label: "Class Academic Record Summary", icon: "menu_book"       },
  { key: "attendance", label: "Attendance Summary Report",     icon: "event_available" },
  { key: "pace",       label: "PACE Progress Summary Report",  icon: "bar_chart"       },
  { key: "analytics",  label: "PACE Analytics & Rankings Report", icon: "leaderboard"   },
];

const PAGE_SIZE = 5;

const COLUMNS = ["Supervisor", "Assigned Grade Level(s)", "Report Submitted", "Submission Date", "Status", "Actions"];

// "Month D, YYYY" date / "H:MM AM" time for the submission column, em dash if none
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

// "Grade 1 — Grade 3" from a teacher's assigned grade levels (single grade -> just that grade)
const gradeRange = (levels = []) => {
  if (!levels.length) return "No grade level assigned";
  const sorted = [...levels].sort((a, b) => (a.level_order ?? 0) - (b.level_order ?? 0));
  const first = sorted[0].level_name;
  const last  = sorted[sorted.length - 1].level_name;
  return sorted.length === 1 ? first : `${first} — ${last}`;
};

// 5-number window of page buttons centred on the current page
function buildPages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
  return [current - 2, current - 1, current, current + 1, current + 2];
}

// coloured status pill: Submitted (all reports/quarters) / Partial (some) / Not Submitted (none)
const StatusPill = ({ status }) => {
  const tone = {
    Submitted:       "bg-emerald-100 text-emerald-700",
    Partial:         "bg-amber-100 text-amber-700",
    "Not Submitted": "bg-slate-100 text-slate-500",
  }[status];
  return <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${tone}`}>{status}</span>;
};

export default function Reports() {
  const schoolYearLabel = useSchoolYear();

  const [teachers,       setTeachers]       = useState([]);   // supervisors list
  const [schoolYears,    setSchoolYears]    = useState([]);
  const [selectedSy,     setSelectedSy]     = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [page,           setPage]           = useState(1);
  const [selectedReport, setSelectedReport] = useState(null); // report open in the modal { teacher, quarter, type }
  const [submissions,    setSubmissions]    = useState({});   // type -> quarter -> teacher_id -> submitted_at
  const [subLoading,     setSubLoading]     = useState(true);

  // Load available years, then default to the operational active year.
  useEffect(() => {
    fetchReportSchoolYears()
      .then((res) => {
        const years = res.data ?? [];
        setSchoolYears(years);
        const active = years.find((year) => year.is_active) ?? years[0];
        setSelectedSy(active ? String(active.sy_id) : "");
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message));
  }, []);

  // Reload supervisors when the principal selects another school year.
  useEffect(() => {
    if (!selectedSy) return;
    fetchReportTeachers(selectedSy)
      .then((res) => setTeachers(res.data ?? []))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [selectedSy]);

  // Load the combined status for every report type and quarter. The quarter
  // filter belongs to the report viewer, not this supervisor summary list.
  useEffect(() => {
    if (!selectedSy) return;
    let cancelled = false;
    const loadSubmissions = () =>
      fetchAllSubmissionStatuses(selectedSy)
        .then((result) => { if (!cancelled) setSubmissions(result.data ?? {}); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setSubLoading(false); });

    loadSubmissions();
    const refreshTimer = window.setInterval(loadSubmissions, 15000);
    window.addEventListener("focus", loadSubmissions);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", loadSubmissions);
    };
  }, [selectedSy]);

  // paginate the supervisor list
  const totalPages   = Math.max(1, Math.ceil(teachers.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const pageTeachers = teachers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePage = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  const subDateFor = (type, quarter, teacherId) => submissions[type]?.[quarter]?.[teacherId] ?? null;

  const submissionsForTeacher = (teacherId) => Object.fromEntries(
    REPORT_TYPES.map((reportType) => [
      reportType.key,
      Object.fromEntries([1, 2, 3, 4].map((quarter) => [quarter, subDateFor(reportType.key, quarter, teacherId)])),
    ])
  );

  // open the report viewer modal for a given teacher + report type
  const openReport = (teacher, type, meta, teacherSubmissions) => {
    setSelectedReport({
      teacher,
      quarter: 1,
      type,
      submissionMatrix: teacherSubmissions,
      ...meta,
    });
  };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="mb-8">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
            Supervisor Academic Reports
          </h2>
          <p className="text-on-surface-variant mt-2 max-w-xl text-sm leading-relaxed">
            Detailed academic logs, individual student progress summaries, and supervisor feedback submissions.
          </p>
          <div className="mt-4 w-full sm:w-64">
            <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">
              School Year
            </label>
            <select
              value={selectedSy}
              onChange={(event) => {
                setLoading(true);
                setSubLoading(true);
                setSelectedSy(event.target.value);
                setPage(1);
                setSelectedReport(null);
              }}
              className="w-full bg-white border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {schoolYears.map((year) => (
                <option key={year.sy_id} value={year.sy_id}>
                  {year.year_label}{year.is_active ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Submission Status Card ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">

          {/* Card Header */}
          <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h3 className="text-lg font-extrabold text-on-surface">Supervisor Submission Status</h3>
              <p className="text-xs text-primary mt-0.5 font-bold">Academic report submissions across all quarters</p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  {COLUMNS.map((h) => (
                    <th key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-left px-5 py-3 whitespace-nowrap align-top">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.map((__, j) => (
                        <td key={j} className="px-5 py-5"><div className="h-4 bg-surface-container-high rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : pageTeachers.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-5 py-12 text-center text-sm text-on-surface-variant">
                      No supervisors found.
                    </td>
                  </tr>
                ) : (
                  // one row per supervisor: derive combined status across 4 reports × 4 quarters
                  pageTeachers.map((teacher) => {
                    const tid = teacher.teacher_id;
                    const teacherSubmissions = submissionsForTeacher(tid);
                    const progress = REPORT_TYPES.map((reportType) => ({
                      ...reportType,
                      dates: [1, 2, 3, 4].map((quarter) => teacherSubmissions[reportType.key][quarter]).filter(Boolean),
                    }));
                    const dates = progress.flatMap((reportType) => reportType.dates);
                    const latest    = dates.length ? dates.map((d) => new Date(d)).sort((a, b) => b - a)[0].toISOString() : null;
                    const count = dates.length;
                    const expectedCount = REPORT_TYPES.length * 4;
                    const status = count === expectedCount ? "Submitted" : count > 0 ? "Partial" : "Not Submitted";
                    const firstSub = progress.find((reportType) => reportType.dates.length > 0);

                    return (
                      <tr key={tid} className="hover:bg-surface-container-lowest transition-colors align-top">
                        {/* Supervisor */}
                        <td className="px-5 py-5 text-sm font-bold text-on-surface whitespace-nowrap">
                          {teacher.firstName} {teacher.lastName}
                        </td>

                        {/* Assigned grade levels */}
                        <td className="px-5 py-5 text-sm text-on-surface whitespace-nowrap">
                          {gradeRange(teacher.gradeLevels)}
                        </td>

                        {/* Report types submitted */}
                        <td className="px-5 py-5">
                          <div className="space-y-1.5">
                            {/* each submitted report type -> openReport(teacher, type, meta) opens <SupervisorReportModal> on that tab */}
                            {progress.map((rt) => {
                              const quarterCount = rt.dates.length;
                              const done = quarterCount === 4;
                              const partial = quarterCount > 0 && !done;
                              return (
                                <button
                                  key={rt.key}
                                  onClick={() => quarterCount > 0 && openReport(teacher, rt.key, { gradeRange: gradeRange(teacher.gradeLevels), status }, teacherSubmissions)}
                                  disabled={quarterCount === 0}
                                  className={`flex items-center gap-1.5 text-xs whitespace-nowrap transition-colors ${
                                    quarterCount > 0 ? "text-on-surface hover:text-primary cursor-pointer" : "text-on-surface-variant/50 cursor-default"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    {done ? "check_circle" : partial ? "pending" : "radio_button_unchecked"}
                                  </span>
                                  {rt.label} <span className="text-on-surface-variant/70">({quarterCount}/4)</span>
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {/* Submission date */}
                        <td className="px-5 py-5 whitespace-nowrap">
                          {subLoading ? (
                            <div className="h-4 w-20 bg-surface-container-high rounded animate-pulse" />
                          ) : latest ? (
                            <>
                              <p className="text-sm font-bold text-on-surface">{formatDate(latest)}</p>
                              <p className="text-[11px] text-on-surface-variant">{formatTime(latest)}</p>
                            </>
                          ) : (
                            <span className="text-sm text-on-surface-variant">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-5 whitespace-nowrap">
                          {subLoading
                            ? <div className="h-5 w-16 bg-surface-container-high rounded-full animate-pulse" />
                            : <StatusPill status={status} />}
                        </td>

                        {/* Actions: View Report -> openReport(teacher, firstSub.key, meta) opens the modal on the first submitted tab */}
                        <td className="px-5 py-5 whitespace-nowrap">
                          <button
                            onClick={() => firstSub && openReport(teacher, firstSub.key, { gradeRange: gradeRange(teacher.gradeLevels), status }, teacherSubmissions)}
                            disabled={!firstSub}
                            className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 hover:text-amber-700 hover:underline disabled:text-on-surface-variant/40 disabled:no-underline disabled:cursor-not-allowed transition-colors"
                          >
                            <span className="material-symbols-outlined text-base">visibility</span>
                            View Report
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-outline-variant/10">
              <p className="text-xs text-on-surface-variant">
                {teachers.length} supervisor{teachers.length !== 1 ? "s" : ""} found
              </p>
              {/* pager -> handlePage(n) (client-side slice of the teacher list) */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                {buildPages(currentPage, totalPages).map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                      currentPage === p
                        ? "bg-on-surface text-white shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => handlePage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </main>

      {selectedReport && (
        <SupervisorReportModal
          teacher={selectedReport.teacher}
          quarter={selectedReport.quarter}
          gradeRange={selectedReport.gradeRange}
          submittedAt={selectedReport.submittedAt}
          status={selectedReport.status}
          submissionMatrix={selectedReport.submissionMatrix}
          initialTab={selectedReport.type}
          schoolYearId={selectedSy}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </PrincipalLayout>
  );
}
