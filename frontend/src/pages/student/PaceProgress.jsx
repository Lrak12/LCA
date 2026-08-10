// PACE Progress (student): "View assigned PACEs" + "View learning progress". Lists the
// student's PACEs per subject with status (completed / in progress / assigned) and lets
// the student request a PACE test, which the supervisor later schedules.
//
// Backend chain (load the PACE list):
//   load -> fetchStudentPace (api/student.js)                 GET /student/pace
//     -> routes/student.routes.js (requireRole "student")
//     -> controllers/student.controller.js > getPace (~line 98)
//     -> services/student.service.js > getStudentPace (~line 802)
//          - student                    : resolve student_id from user_id
//          - pace_quarterly_projection  : the planned 4-quarter slots (getPaceProjectionRows)
//          - student_pace + pace_module : the actual assigned PACEs + subject/module_number
//          - pace_test_result           : scores; a >=90 test also counts the PACE completed
//        -> overlays real completions onto the plan -> per-subject status + completion rate
//
// Backend chain (request a PACE test  -  handleSubmitRequest):
//   submitPaceTestRequest(sp_id) (api/student.js)             POST /student/pace/test-request
//     -> controllers/student.controller.js > requestPaceTest (~line 103)
//     -> services/student.service.js > submitPaceTestRequest (~line 1141)
//          - verifies the PACE (student_pace row) belongs to this student (ownership check)
//          - finds its quarter from pace_quarterly_projection so the supervisor's
//            quarter-filtered scheduling list picks it up
//          - resolves the supervisor: student_pace.teacher_id, else grade_level.teacher_id
//          - GATE: self_test_result average for this PACE must be >= 90, and no request is
//            already pending/scheduled, else it throws
//          - STORES the request as a pace_test_result row (status "Requested") - the one
//            student write - then notifies the supervisor (notification.service)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentPace, submitPaceTestRequest } from "../../api/student.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatDateRaw = (raw) =>
  raw ? new Date(raw).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, iconBg, iconColor, label, value, badge, badgeColor, dark }) => (
  <div className={`rounded-2xl p-6 flex flex-col gap-3 ${dark ? "bg-primary text-white" : "bg-white shadow-sm border border-outline-variant/20"}`}>
    <div className="flex items-center justify-between">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? "bg-white/10" : iconBg}`}>
        <span className={`material-symbols-outlined text-xl ${dark ? "text-white" : iconColor}`} style={fillStyle}>
          {icon}
        </span>
      </div>
      {badge && (
        <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${dark ? "bg-white/20 text-white" : badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
    <div>
      <p className={`text-[10px] font-extrabold tracking-widest uppercase mb-1 ${dark ? "text-white/60" : "text-on-surface-variant"}`}>
        {label}
      </p>
      <p className={`font-headline text-4xl font-extrabold ${dark ? "text-white" : "text-primary"}`}>
        {value}
      </p>
    </div>
  </div>
);

// ─── Subject colors ───────────────────────────────────────────────────────────
const subjectColors = {
  Mathematics: { text: "text-black-600"  },
  English:     { text: "text-black-600"  },
  Science:     { text: "text-black-600" },
  default:     { text: "text-black-600" },
};

const subjectColor = (subject) =>
  (subjectColors[subject] ?? subjectColors.default).text;

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    "In Progress":     "bg-blue-100 text-blue-700",
    "Completed":       "bg-green-100 text-green-700",
    "Passed":          "bg-green-100 text-green-700",
    "Failed":          "bg-red-100 text-red-700",
    "Taken Home":      "bg-amber-100 text-amber-700",
    "Needs Next PACE": "bg-purple-100 text-purple-700",
    "Not Started":     "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full ${styles[status] ?? "bg-slate-100 text-slate-500"}`}>
      {status}
    </span>
  );
};

// ─── Next PACE Test field ─────────────────────────────────────────────────────
const NextTestField = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">{label}</p>
    <p className="text-sm font-bold text-on-surface">{value || "—"}</p>
  </div>
);

// ─── Readiness / Schedule-status badges (Readiness & Scheduling table) ─────────
const ReadinessBadge = ({ ready }) => (
  <span className={`text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full ${ready ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-600"}`}>
    {ready ? "Ready" : "Not Ready"}
  </span>
);

// Maps a test-request row to its schedule-status label + action.
const scheduleStatusInfo = (req) => {
  if (req.state === "scheduled")
    return { label: "Scheduled", sub: "", cls: "bg-blue-100 text-blue-700", action: "view-schedule" };
  if (req.state === "requested")
    return { label: "Pending Approval", sub: "Request submitted", cls: "bg-amber-100 text-amber-700", action: "view-request" };
  if (req.eligible)
    return { label: "Ready to Schedule", sub: "", cls: "bg-green-100 text-green-700", action: "submit" };
  return { label: "Not Available", sub: "Requirements not met", cls: "bg-slate-100 text-slate-500", action: "self-test" };
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────
const ProgressBar = ({ value }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
    <span className="text-sm font-extrabold text-on-surface w-9 text-right">{value}%</span>
  </div>
);

// ─── Table Headers ────────────────────────────────────────────────────────────
const TH = ({ children }) => (
  <th className="text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 text-left">
    {children}
  </th>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaceProgress() {
  const { user }              = useAuth();
  const navigate              = useNavigate();
  const schoolYearLabel       = useSchoolYear();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [submittingId, setSubmittingId] = useState(null);
  const [notice, setNotice]   = useState("");
  const [viewReq, setViewReq] = useState(null); // request shown in the View Request modal
  const [viewSchedule, setViewSchedule] = useState(null); // scheduled test shown in the View Schedule modal
  const [viewSelfTest, setViewSelfTest] = useState(null); // PACE shown in the Go to Self-Test modal
  const [quarterFilter, setQuarterFilter] = useState("all"); // "all" | "1".."4"
  const [selectedPace, setSelectedPace]   = useState({});     // subject → paceNo

  // Pull the student's PACE list: GET /student/pace (see backend chain at top).
  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    return fetchStudentPace()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmitRequest = async (sp_id) => {
    if (!sp_id) return;
    setSubmittingId(sp_id);
    setError("");
    setNotice("");
    try {
      // POST /student/pace/test-request - inserts the "Requested" pace_test_result row
      // (backend gates on self-test >= 90 and notifies the supervisor); then reload.
      await submitPaceTestRequest(sp_id);
      setNotice("Your PACE test request was submitted. Your supervisor will schedule it.");
      await load(false);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setSubmittingId(null);
    }
  };

  const firstName = user?.first_name ?? user?.username ?? "Student";

  const paceStats = data?.paceStats ?? { completed: 5, ongoing: 2, remaining: 3, completionRate: 62 };

  const completedPaces = data?.completedPaces ?? [
    { subject: "Mathematics", module: "Math 4A", paceNo: 1095, assignedBy: "Supervisor Maria L.", completeDate: "June 24, 2026", finalScore: 90, remarks: "Great job! Keep it up." },
    { subject: "English",     module: "English 4A", paceNo: 1096, assignedBy: "Supervisor Maria L.", completeDate: "June 23, 2026", finalScore: 92, remarks: "Excellent performance." },
    { subject: "Science",     module: "Science 4A", paceNo: 1094, assignedBy: "Supervisor Maria L.", completeDate: "June 23, 2026", finalScore: 87, remarks: "Good work!" },
  ];

  const testRequests = data?.testRequests ?? [];
  const nextPaceTest = data?.nextPaceTest ?? null;

  const paceModules = data?.paceModules ?? [];

  // Filter PACE modules by the chosen quarter, then group by subject so each
  // subject is one row with a per-row PACE-number dropdown.
  const subjectRows = (() => {
    const filtered = paceModules.filter(
      (m) => quarterFilter === "all" || String(m.quarter) === quarterFilter,
    );
    const bySubject = new Map();
    filtered.forEach((m) => {
      const arr = bySubject.get(m.subject) ?? [];
      arr.push(m);
      bySubject.set(m.subject, arr);
    });
    return [...bySubject.entries()]
      .map(([subject, mods]) => {
        const paces = [...mods].sort((a, b) => (a.paceNo ?? 0) - (b.paceNo ?? 0));
        const chosen =
          paces.find((m) => m.paceNo === selectedPace[subject]) ??
          paces.find((m) => m.isCurrent) ??
          paces[0];
        return { subject, paces, chosen };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
  })();

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>
            {notice}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              PACE Progress
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-lg">
              Check your PACE completion, assessment scores, and overall academic
              standing here.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Stat Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          ) : (
            <>
              <StatCard
                icon="check_circle"
                iconBg="bg-green-100"
                iconColor="text-green-600"
                label="Completed PACEs"
                value={paceStats.completed}
                badge="+1 This Week"
                badgeColor="bg-green-100 text-green-700"
              />
              <StatCard
                icon="pending"
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                label="Ongoing PACEs"
                value={paceStats.ongoing}
                badge="No Change"
                badgeColor="bg-slate-100 text-slate-500"
              />
              <StatCard
                icon="hourglass_empty"
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                label="Remaining PACEs"
                value={paceStats.remaining}
                badge="+1 From Last Update"
                badgeColor="bg-blue-100 text-blue-700"
              />
              <StatCard
                icon="verified"
                iconBg=""
                iconColor=""
                label="Completion Rate"
                value={`${paceStats.completionRate}%`}
                badge="100% Last Completion"
                dark
              />
            </>
          )}
        </div>

        {/* ── Next PACE Test ───────────────────────────────────────── */}
        {!loading && nextPaceTest && (
          <article className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 mb-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg" style={fillStyle}>event_upcoming</span>
                <h3 className="font-headline text-base font-extrabold text-primary">Next PACE Test</h3>
              </div>
              <button
                onClick={() => setViewSelfTest({
                  subject:   nextPaceTest.subject,
                  paceNo:    nextPaceTest.paceNo,
                  selfTests: nextPaceTest.selfTests ?? [],
                })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-sm">edit_note</span>
                Go to Self-Test
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-5 gap-x-6 items-start">
              <NextTestField label="PACE" value={`${nextPaceTest.subject} ${nextPaceTest.paceNo ?? ""}`.trim()} />
              <NextTestField label="Date & Time" value={`${nextPaceTest.date} • ${nextPaceTest.time}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Status</p>
                  <span className="text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full bg-blue-100 text-blue-700">
                    {nextPaceTest.status}
                  </span>
                </div>
              </div>
              <NextTestField label="Test Location" value={nextPaceTest.location} />
              <NextTestField label="Test Type" value={nextPaceTest.testType} />
              <NextTestField label="Supervisor" value={nextPaceTest.supervisor} />
            </div>
          </article>
        )}

        {/* ── Completed PACEs ──────────────────────────────────────── */}
        <article className="bg-white rounded-2xl p-7 shadow-sm border border-outline-variant/20 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline text-xl font-extrabold text-primary">Completed PACEs</h3>
            <button className="text-sm font-bold text-primary hover:underline">View All</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : completedPaces.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">No completed PACEs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant/20">
                    <TH>Subject</TH>
                    <TH>Pace No.</TH>
                    <TH>Assigned Date</TH>
                    <TH>Complete Date</TH>
                    <TH>Final Score</TH>
                    <TH>Status</TH>
                    <TH>Remarks</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {completedPaces.map((pace, i) => (
                    <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-4 pr-6">
                        <button className={`text-sm font-extrabold ${subjectColor(pace.subject)} hover:underline`}>
                          {pace.subject}
                        </button>
                      </td>
                      <td className="py-4 pr-6">
                        <span className="text-sm font-bold text-on-surface">{pace.paceNo ?? pace.module}</span>
                      </td>
                      <td className="py-4 pr-6">
                        <span className="text-sm text-on-surface-variant">{formatDateRaw(pace.assignedDate)}</span>
                      </td>
                      <td className="py-4 pr-6">
                        <span className="text-sm text-on-surface-variant">{formatDateRaw(pace.completeDate)}</span>
                      </td>
                      <td className="py-4 pr-6">
                        <span className={`text-sm font-extrabold ${pace.finalScore >= 90 ? "text-green-600" : pace.finalScore >= 75 ? "text-amber-600" : "text-red-500"}`}>
                          {pace.finalScore}%
                        </span>
                      </td>
                      <td className="py-4 pr-6">
                        <span className={`text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full ${pace.passed ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-600"}`}>
                          {pace.passed ? "Passed" : "Failed"}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="text-sm text-on-surface-variant">{pace.remarks ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* ── Current PACE Modules ─────────────────────────────────── */}
        <article className="bg-white rounded-2xl p-7 shadow-sm border border-outline-variant/20">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline text-xl font-extrabold text-primary">Current Pace Modules</h3>
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Quarter</label>
              <select
                value={quarterFilter}
                onChange={(e) => setQuarterFilter(e.target.value)}
                className="text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="all">All Quarters</option>
                <option value="1">1st Quarter</option>
                <option value="2">2nd Quarter</option>
                <option value="3">3rd Quarter</option>
                <option value="4">4th Quarter</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : subjectRows.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">
              No PACE modules for {quarterFilter === "all" ? "any quarter" : `quarter ${quarterFilter}`}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant/20">
                    <TH>Subject</TH>
                    <TH>Pace No.</TH>
                    <TH>Assigned Date</TH>
                    <TH>Estimated Date</TH>
                    <TH>Status</TH>
                    <TH>Remarks</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {subjectRows.map(({ subject, paces, chosen }) => (
                    <tr key={subject} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-4 pr-6">
                        <span className={`text-sm font-extrabold ${subjectColor(subject)}`}>
                          {subject}
                        </span>
                      </td>
                      <td className="py-4 pr-6">
                        {paces.length > 1 ? (
                          <select
                            value={chosen?.paceNo ?? ""}
                            onChange={(e) =>
                              setSelectedPace((prev) => ({ ...prev, [subject]: Number(e.target.value) }))
                            }
                            className="text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-8 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {paces.map((m) => (
                              <option key={m.paceNo} value={m.paceNo}>
                                PACE {m.paceNo}
                                {quarterFilter === "all" ? ` · Q${m.quarter}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm font-bold text-on-surface">
                            {chosen?.paceNo != null ? `PACE ${chosen.paceNo}` : "—"}
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-6">
                        <span className="text-sm text-on-surface-variant">{formatDateRaw(chosen?.assignedDate)}</span>
                      </td>
                      <td className="py-4 pr-6">
                        <span className="text-sm text-on-surface-variant">{formatDateRaw(chosen?.estimatedDate)}</span>
                      </td>
                      <td className="py-4 pr-6">
                        <StatusBadge status={chosen?.status} />
                      </td>
                      <td className="py-4">
                        <span className="text-sm text-on-surface-variant">{chosen?.remarks ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* ── PACE Test Readiness and Scheduling ───────────────────── */}
        <article className="bg-white rounded-2xl p-7 shadow-sm border border-outline-variant/20 mt-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline text-xl font-extrabold text-primary">PACE Test Readiness and Scheduling</h3>
            <button className="text-sm font-bold text-primary hover:underline">View All</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : testRequests.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">No current PACEs to schedule yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant/20">
                    <TH>Subject</TH>
                    <TH>Pace No.</TH>
                    <TH>Readiness</TH>
                    <TH>PACE Test Schedule Status</TH>
                    <TH>Scheduled Date and Time</TH>
                    <TH>Action</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {testRequests.map((req) => {
                    const info = scheduleStatusInfo(req);
                    return (
                      <tr key={req.sp_id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="py-4 pr-6">
                          <span className={`text-sm font-extrabold ${subjectColor(req.subject)}`}>{req.subject}</span>
                        </td>
                        <td className="py-4 pr-6">
                          <span className="text-sm font-bold text-on-surface">{req.paceNo ?? "—"}</span>
                        </td>
                        <td className="py-4 pr-6">
                          <ReadinessBadge ready={req.eligible} />
                        </td>
                        <td className="py-4 pr-6">
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full w-fit ${info.cls}`}>
                              {info.label}
                            </span>
                            {info.sub && <span className="text-[10px] text-on-surface-variant">{info.sub}</span>}
                          </div>
                        </td>
                        <td className="py-4 pr-6">
                          {req.scheduledDate ? (
                            <span className="text-sm text-on-surface-variant">
                              {req.scheduledDate}<br /><span className="text-xs">{req.scheduledTime}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-on-surface-variant">—</span>
                          )}
                        </td>
                        <td className="py-4">
                          {info.action === "submit" ? (
                            <button
                              onClick={() => handleSubmitRequest(req.sp_id)}
                              disabled={submittingId === req.sp_id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-40"
                            >
                              {submittingId === req.sp_id ? "Submitting…" : "Submit Request"}
                            </button>
                          ) : info.action === "self-test" ? (
                            <button
                              onClick={() => setViewSelfTest(req)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">edit_note</span>
                              Go to Self-Test
                            </button>
                          ) : info.action === "view-schedule" ? (
                            <button
                              onClick={() => setViewSchedule(req)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                              View Schedule
                            </button>
                          ) : (
                            <button
                              onClick={() => setViewReq(req)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                              View Request
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* View Request modal — details of a pending PACE-test request */}
        {viewReq && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && setViewReq(null)}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">open_in_new</span>
                  <h2 className="font-headline text-lg font-extrabold text-on-surface">View Request</h2>
                </div>
                <button onClick={() => setViewReq(null)} className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Details */}
              <div className="px-6 pb-2 grid grid-cols-2 gap-x-6 gap-y-6">
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Subject</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewReq.subject}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">PACE Number</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewReq.paceNo ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Request Date</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewReq.requestedDate ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Status</p>
                  <span className="inline-block mt-1.5 text-[11px] font-extrabold tracking-widest uppercase bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
                    Pending Approval
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-5 flex justify-end">
                <button onClick={() => setViewReq(null)} className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Schedule modal — details of a scheduled PACE test */}
        {viewSchedule && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && setViewSchedule(null)}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">calendar_month</span>
                  <h2 className="font-headline text-lg font-extrabold text-on-surface">View Schedule</h2>
                </div>
                <button onClick={() => setViewSchedule(null)} className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Details */}
              <div className="px-6 pb-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-6">
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Subject</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSchedule.subject}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">PACE Number</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSchedule.paceNo ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Test Type</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSchedule.testType ?? "PACE Test"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Date &amp; Time</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">
                    {viewSchedule.scheduledDate ?? "—"}
                    {viewSchedule.scheduledTime && (
                      <><br /><span className="text-sm">{viewSchedule.scheduledTime}</span></>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Duration</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">1 hour</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Test Location</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSchedule.location ?? "—"}</p>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Supervisor</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSchedule.supervisor ?? "—"}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-5 flex justify-end">
                <button onClick={() => setViewSchedule(null)} className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Go to Self-Test modal — self-test progress + attempt results for a PACE */}
        {viewSelfTest && (() => {
          const required  = 3; // target number of self-tests per PACE
          const passMark  = 90; // a self-test must score ≥ 90 to count as passed
          const attempts  = viewSelfTest.selfTests ?? [];
          const completed = attempts.length;
          const progress  = Math.round((Math.min(completed, required) / required) * 100);
          const slots     = Array.from({ length: Math.max(required, completed) });
          const hasPassed = attempts.some((st) => st.passed); // gate for scheduling a PACE test
          const bestScore = attempts.length ? Math.max(...attempts.map((st) => st.score ?? 0)) : null;
          return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && setViewSelfTest(null)}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">open_in_new</span>
                  <h2 className="font-headline text-lg font-extrabold text-on-surface">Go to Self-Test</h2>
                </div>
                <button onClick={() => setViewSelfTest(null)} className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Details */}
              <div className="px-6 pb-2 grid grid-cols-3 gap-x-6 gap-y-6">
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Subject</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSelfTest.subject}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">PACE Number</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{viewSelfTest.paceNo ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Required Self-Tests</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{required}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Completed</p>
                  <p className="text-base font-bold text-on-surface mt-1.5">{completed} / {required}</p>
                </div>
              </div>

              {/* Overall progress */}
              <div className="px-6 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant">Overall Progress</p>
                  <span className="text-sm font-extrabold text-on-surface">{progress}%</span>
                </div>
                <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Self-test list */}
              <div className="px-6 pt-5">
                <p className="text-[11px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">Self-Test List</p>
                <div className="space-y-2">
                  {slots.map((_, i) => {
                    const st = attempts[i];
                    return (
                      <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
                        <span className="text-sm font-bold text-on-surface">Self-Test {i + 1}</span>
                        {st ? (
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-extrabold tracking-wide uppercase ${st.passed ? "text-green-600" : "text-red-500"}`}>
                              {st.passed ? "Passed" : "Failed"}
                            </span>
                            <span className="text-sm font-bold text-on-surface">{st.score}%</span>
                            {st.date && <span className="text-xs text-on-surface-variant">{st.date}</span>}
                          </div>
                        ) : (
                          <span className="text-xs font-extrabold tracking-wide uppercase text-red-500">Not Taken</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Why the student can't schedule yet — shown until a self-test passes */}
              {!hasPassed && (
                <div className="px-6 pt-5">
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                    <span className="material-symbols-outlined text-amber-600 text-lg leading-none">info</span>
                    <p className="text-xs font-medium text-amber-800 leading-relaxed">
                      You can't schedule a PACE test yet. You need at least one self-test scored{" "}
                      <span className="font-bold">{passMark}% or higher</span> to become eligible.
                    </p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-5 flex justify-end gap-3">
                <button onClick={() => navigate("/student/assessments")} className="px-6 py-2.5 rounded-xl bg-primary text-sm font-bold text-white hover:opacity-90 transition-opacity">
                  Go to Self-Test
                </button>
                <button onClick={() => setViewSelfTest(null)} className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
          );
        })()}

      </main>
    </StudentLayout>
  );
}
