import { useState, useEffect, useCallback } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import StudentAcademicRecordModal from "../../components/StudentAcademicRecordModal.jsx";
import PaceAnalyticsTab from "./PaceAnalyticsTab.jsx";
import RankingTab from "./RankingTab.jsx";
import { fetchStudentMonitoringOverview } from "../../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const formatDate = (d = new Date()) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const pct = (n) => `${(n ?? 0).toFixed(2)}%`;

// Panel view: only the Student Records tab is shown. Full set was
// ["Student Records", "Student Progress", "PACE Analytics", "Ranking"].
const TABS = ["Student Records"];

const GenderBadge = ({ gender }) => (
  <span className={`text-[11px] font-bold px-3 py-0.5 rounded-full ${gender === "Female" ? "bg-pink-100 text-pink-600" : gender === "Male" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>{gender}</span>
);
const PaceStatusBadge = ({ status }) => (
  <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full whitespace-nowrap ${status === "On Track" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{status}</span>
);

// Top row stat card (big number + sub %)
const TopStat = ({ label, value, sub, subColor, icon, iconBg, iconColor }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
    <div className="flex items-start justify-between">
      <p className="text-xs font-bold text-on-surface-variant max-w-[70%] leading-snug">{label}</p>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
        <span className={`material-symbols-outlined text-base ${iconColor}`} style={fillStyle}>{icon}</span>
      </span>
    </div>
    <p className="text-4xl font-extrabold text-on-surface mt-3">{value}</p>
    {sub && <p className={`text-xs font-bold mt-1 ${subColor ?? "text-on-surface-variant"}`}>{sub}</p>}
  </div>
);

// Supervisor Student Monitoring page. 4 tabs: Records / Progress / PACE Analytics /
// Ranking. Records + Progress share one call (GET /teacher/student-monitoring-overview,
// teacher.service.getStudentMonitoringOverview); Analytics + Ranking are their own
// components (PaceAnalyticsTab / RankingTab) that fetch on their own. "View" opens
// StudentAcademicRecordModal.
export default function StudentMonitoring() {
  const schoolYearLabel = useSchoolYear();

  const [tab,          setTab]          = useState("Student Records");
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [grade,        setGrade]        = useState("all");
  const [search,       setSearch]       = useState("");
  const [paceStatus,   setPaceStatus]   = useState("all");
  const [assessStatus, setAssessStatus] = useState("all");
  const [subject,      setSubject]      = useState("all");
  const [page,         setPage]         = useState(1);
  const [selected,     setSelected]     = useState(null);

  // one endpoint backs both Records and Progress; assessStatus is only sent on
  // Records and subject only on Progress, so the stat cards stay overall.
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchStudentMonitoringOverview({
      grade, search, paceStatus,
      assessStatus: tab === "Student Records" ? assessStatus : "all",
      subject:      tab === "Student Progress" ? subject : "all",
      page,
    })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [tab, grade, search, paceStatus, assessStatus, subject, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, grade, search, paceStatus, assessStatus, subject]); // back to page 1 on filter change

  const stats       = data?.stats ?? {};
  const rows        = data?.students ?? [];
  const total       = data?.totalStudents ?? 0;
  const totalPages  = data?.totalPages ?? 1;
  const gradeLevels = data?.gradeLevels ?? [];
  const subjects    = data?.subjects ?? [];
  const startIdx    = total ? (page - 1) * 8 + 1 : 0;
  const endIdx      = Math.min(page * 8, total);

  const Pagination = () => (
    <div className="flex items-center justify-between pt-4 flex-wrap gap-3">
      <p className="text-xs text-on-surface-variant">Showing {startIdx} to {endIdx} of {total} students</p>
      <div className="flex items-center gap-1">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
          <button key={p} onClick={() => setPage(p)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${p === page ? "bg-primary text-white" : "border border-gray-200 text-on-surface-variant hover:bg-gray-50"}`}>{p}</button>
        ))}
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>
    </div>
  );

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary uppercase">Student Monitoring</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Monitor student progress and performance across all assessments</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
              <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-on-surface-variant">Grade Level</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}
                className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-3 pr-8 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="all">All Grades</option>
                {gradeLevels.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Top stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <TopStat label="Total Students Monitored" value={stats.totalStudents ?? 0} sub="All grade levels" icon="groups" iconBg="bg-blue-50" iconColor="text-blue-600" />
          <TopStat label="Assessed (Tests Taken)" value={stats.assessed ?? 0} sub={`${total0(stats.totalStudents) ? pct((stats.assessed / stats.totalStudents) * 100) : "0%"} of total`} subColor="text-green-600" icon="task_alt" iconBg="bg-green-50" iconColor="text-green-600" />
          <TopStat label="Scheduled to Take Test" value={stats.scheduledToTake ?? 0} sub={`${total0(stats.totalStudents) ? pct((stats.scheduledToTake / stats.totalStudents) * 100) : "0%"} of total`} subColor="text-amber-600" icon="event" iconBg="bg-amber-50" iconColor="text-amber-600" />
          <TopStat label="Not Assessed (Not Yet Taken)" value={stats.notAssessed ?? 0} sub={`${total0(stats.totalStudents) ? pct((stats.notAssessed / stats.totalStudents) * 100) : "0%"} of total`} subColor="text-on-surface-variant" icon="remove_circle" iconBg="bg-slate-100" iconColor="text-slate-500" />
        </div>

        {/* Second stat row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5 flex items-center gap-4">
            <Donut value={stats.paceCompletionRate ?? 0} />
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant">PACE Completion Rate</p>
              <p className="text-2xl font-extrabold text-on-surface mt-1">{pct(stats.paceCompletionRate)}</p>
              <p className="text-[11px] text-green-600 font-bold">Average completion rate</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-500" style={fillStyle}>emoji_events</span>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant">Top Performer</p>
            </div>
            <p className="text-xl font-extrabold text-on-surface leading-tight">{stats.topPerformer?.name ?? "—"}</p>
            <p className="text-[11px] text-purple-600 font-bold mt-1">{stats.topPerformer ? `${pct(stats.topPerformer.completionRate)} Completion Rate` : "No data"}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-blue-500" style={fillStyle}>insights</span>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant">Average PACE Progress</p>
            </div>
            <p className="text-2xl font-extrabold text-on-surface mt-1">{pct(stats.avgPaceProgress)}</p>
            <p className="text-[11px] text-on-surface-variant font-bold">Across all students</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-red-500" style={fillStyle}>error</span>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-on-surface-variant">Students Needing Attention</p>
            </div>
            <p className="text-4xl font-extrabold text-on-surface mt-1">{stats.needingAttention ?? 0}</p>
            <p className="text-[11px] text-red-500 font-bold">Below 50% completion</p>
          </div>
        </div>

        {/* Tabs + content */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
          <div className="flex items-center border-b border-outline-variant/20 px-4 gap-2">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-4 text-sm font-bold -mb-px border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Student Records" ? (
            <div className="p-5">
              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
                  <input type="text" placeholder="Search students by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {/* clear (×) -> empty the box */}
                  {search && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none">close</button>
                  )}
                </div>
                <select value={assessStatus} onChange={(e) => setAssessStatus(e.target.value)}
                  className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">All Status</option>
                  <option value="assessed">Assessed</option>
                  <option value="not-assessed">Not Assessed</option>
                </select>
                <select value={paceStatus} onChange={(e) => setPaceStatus(e.target.value)}
                  className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-8 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">All PACE Status</option>
                  <option value="On Track">On Track</option>
                  <option value="Needs Attention">Needs Attention</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                      <th className="px-4 py-3 text-left">Student ID</th>
                      <th className="px-4 py-3 text-left">Student Name</th>
                      <th className="px-4 py-3 text-left">Grade Level</th>
                      <th className="px-4 py-3 text-center">Gender</th>
                      <th className="px-4 py-3 text-left">Ongoing Pace</th>
                      <th className="px-4 py-3 text-left">Performance Points</th>
                      <th className="px-4 py-3 text-center">Pace Status</th>
                      <th className="px-4 py-3 text-left">Last Pace Test</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-on-surface-variant"><span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" /> <span className="ml-2 align-middle text-sm">Loading…</span></td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-on-surface-variant">No students match.</td></tr>
                    ) : rows.map((r) => (
                      <tr key={r.id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40">
                        <td className="px-4 py-4 text-on-surface-variant">{r.id}</td>
                        <td className="px-4 py-4 font-bold text-on-surface">{r.name}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.gradeLevel}</td>
                        <td className="px-4 py-4 text-center"><GenderBadge gender={r.gender} /></td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.ongoingPace}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.performancePoints} pts</td>
                        <td className="px-4 py-4 text-center"><PaceStatusBadge status={r.paceStatus} /></td>
                        <td className="px-4 py-4 text-on-surface-variant whitespace-nowrap">{fmtDate(r.lastPaceTest)}</td>
                        <td className="px-4 py-4 text-center">
                          <button onClick={() => setSelected({ id: r.id })}
                            className="px-4 py-2 bg-[#0d1b2e] text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">
                            View Student
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination />
            </div>
          ) : tab === "Student Progress" ? (
            <div className="p-5">
              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
                  <input type="text" placeholder="Search students by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {/* clear (×) -> empty the box */}
                  {search && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none">close</button>
                  )}
                </div>
                <select value={paceStatus} onChange={(e) => setPaceStatus(e.target.value)}
                  className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-8 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">All PACE Status</option>
                  <option value="On Track">On Track</option>
                  <option value="Needs Attention">Needs Attention</option>
                </select>
                <select value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-8 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">All Subjects/PACE</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                      <th className="px-4 py-3 text-left">Student ID</th>
                      <th className="px-4 py-3 text-left">Student Name</th>
                      <th className="px-4 py-3 text-left">Completion Rate</th>
                      <th className="px-4 py-3 text-left">Completed Paces</th>
                      <th className="px-4 py-3 text-left">On-Time Paces</th>
                      <th className="px-4 py-3 text-left">Performance Points</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant"><span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" /> <span className="ml-2 align-middle text-sm">Loading…</span></td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-on-surface-variant">No students match.</td></tr>
                    ) : rows.map((r) => (
                      <tr key={r.id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40">
                        <td className="px-4 py-4 text-on-surface-variant">{r.id}</td>
                        <td className="px-4 py-4 font-bold text-on-surface">{r.name}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{(r.completion ?? 0).toFixed(0)} %</td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.completedPaces ?? 0}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.onTimePaces ?? 0}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{r.performancePoints ?? 0}</td>
                        <td className="px-4 py-4 text-center"><PaceStatusBadge status={r.paceStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination />
            </div>
          ) : tab === "PACE Analytics" ? (
            // these two tabs load their own data (getPaceAnalyticsOverview / getStudentRankings)
            <PaceAnalyticsTab grade={grade} />
          ) : (
            <RankingTab grade={grade} />
          )}
        </div>
      </main>

      {selected && <StudentAcademicRecordModal studentId={selected.id} onClose={() => setSelected(null)} />}
    </TeacherLayout>
  );
}

// helper: guard against divide-by-zero on totals
function total0(n) { return n != null && n > 0; }

// Small donut for completion rate
function Donut({ value }) {
  const r = 22, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-container-high" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
        className="text-green-500" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 28 28)" />
    </svg>
  );
}
