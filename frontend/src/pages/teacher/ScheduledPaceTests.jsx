import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import Pagination from "../../components/Pagination.jsx";
import {fetchScheduledTests,updatePaceTestSchedule,cancelPaceTest,} from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const PAGE_SIZE = 6;

const QUARTER_OPTS = [
  { value: "", label: "All Quarters" },
  { value: "1", label: "1st Quarter" },
  { value: "2", label: "2nd Quarter" },
  { value: "3", label: "3rd Quarter" },
  { value: "4", label: "4th Quarter" },
];
const STATUS_OPTS = ["Scheduled", "Rescheduled", "Completed", "Missed"];
//style rani siya
const STATUS_STYLE = {
  Scheduled:   "bg-blue-100 text-blue-700",
  Completed:   "bg-green-100 text-green-700",
  Rescheduled: "bg-orange-100 text-orange-700",
  Missed:      "bg-red-100 text-red-700",
  Cancelled:   "bg-slate-100 text-slate-500",
};

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const toDateInput = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toTimeInput = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toTimeString().slice(0, 5);
};

const StatCard = ({ label, value, tint }) => (
  <div className={`rounded-2xl border p-5 ${tint.bg} ${tint.border}`}>
    <p className={`text-xs font-extrabold uppercase tracking-wide ${tint.label}`}>{label}</p>
    <p className={`text-4xl font-extrabold mt-2 ${tint.value}`}>{value}</p>
  </div>
);
const TINTS = {
  today:     { bg: "bg-blue-50",   border: "border-blue-200",   label: "text-blue-700",   value: "text-blue-600"   },
  upcoming:  { bg: "bg-green-50",  border: "border-green-200",  label: "text-green-700",  value: "text-green-600"  },
  completed: { bg: "bg-purple-50", border: "border-purple-200", label: "text-purple-700", value: "text-purple-600" },
  missed:    { bg: "bg-orange-50", border: "border-orange-200", label: "text-orange-700", value: "text-orange-600" },
};

export default function ScheduledPaceTests() {
  const schoolYearLabel = useSchoolYear();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedStudentId = Number(searchParams.get("student_id")) || null;

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [refresh, setRefresh] = useState(0);

  const [quarter, setQuarter] = useState("");
  const [subject, setSubject] = useState("all");
  const [status,  setStatus]  = useState("all");
  const [from,    setFrom]    = useState("");
  const [to,      setTo]      = useState("");
  const [page,    setPage]    = useState(1);

  const [selId,   setSelId]   = useState(null);
  const [editing, setEditing] = useState(false);
  const [editVals, setEditVals] = useState({ date: "", time: "", status: "Scheduled" });
  const [saving,  setSaving]  = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchScheduledTests({ quarter, subject, status, from, to, student_id: selectedStudentId })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [quarter, subject, status, from, to, selectedStudentId]);

  useEffect(() => { load(); }, [load, refresh]);
  useEffect(() => { setPage(1); }, [quarter, subject, status, from, to]);

  const stats    = data?.stats ?? { scheduledToday: 0, upcoming: 0, completed: 0, missedOrRescheduled: 0 };
  const subjects = data?.subjects ?? [];
  const tests    = data?.tests ?? [];
  const totalPages = Math.max(1, Math.ceil(tests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows   = tests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx   = tests.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endIdx     = Math.min(currentPage * PAGE_SIZE, tests.length);
  const selected   = tests.find((t) => t.pts_id === selId) ?? null;

  const openDetails = (t) => {
    setSelId(t.pts_id);
    setEditing(false);
    setDetailErr("");
    setEditVals({ date: toDateInput(t.scheduledAt), time: toTimeInput(t.scheduledAt), status: t.status === "Missed" ? "Scheduled" : t.status });
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    setDetailErr("");
    try {
      await updatePaceTestSchedule(selected.pts_id, {
        scheduled_date: editVals.date,
        scheduled_time: editVals.time,
        status: editVals.status,
      });
      setEditing(false);
      setRefresh((k) => k + 1);
    } catch (err) {
      setDetailErr(err.response?.data?.message ?? err.message ?? "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!selected) return;
    setCancelling(true);
    setDetailErr("");
    try {
      await cancelPaceTest(selected.pts_id);
      setConfirmCancel(false);
      setSelId(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      setDetailErr(err.response?.data?.message ?? err.message ?? "Failed to cancel.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Back button */}
        <button
          onClick={() => navigate("/teacher/pace")}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-on-surface-variant hover:text-primary transition-colors mb-3"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to PACE Monitoring
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest mb-2">
          <button onClick={() => navigate("/teacher/pace")} className="text-on-surface-variant hover:text-primary transition-colors">PACE Monitoring</button>
          <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
          <span className="text-secondary">Scheduled PACE Tests</span>
        </nav>

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">SCHEDULED PACE TEST</h2>
              <p className="text-on-surface-variant mt-1">
                {selectedStudentId
                  ? "View and manage scheduled PACE assessments for the selected student."
                  : "View and manage scheduled PACE assessments for students."}
              </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          <StatCard label="Scheduled Today" value={stats.scheduledToday} tint={TINTS.today} />
          <StatCard label="Upcoming Tests" value={stats.upcoming} tint={TINTS.upcoming} />
          <StatCard label="Completed Tests" value={stats.completed} tint={TINTS.completed} />
          <StatCard label="Missed / Rescheduled" value={stats.missedOrRescheduled} tint={TINTS.missed} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
            className=" text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
            {QUARTER_OPTS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}
            className=" text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
            <option value="all">All Subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-3 py-1.5 shadow-sm">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="text-sm font-bold text-on-surface focus:outline-none" />
            <span className="text-on-surface-variant text-sm">–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="text-sm font-bold text-on-surface focus:outline-none" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className=" text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
            <option value="all">All Status</option>
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : !tests.length ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3 block" style={fillStyle}>event_busy</span>
              <p className="text-base font-bold text-on-surface">No scheduled tests</p>
              <p className="text-sm text-on-surface-variant mt-1">
                {selectedStudentId
                  ? "This student has no scheduled PACE tests matching the selected filters."
                  : "Schedule a PACE test from the PACE Test Scheduling page."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                      <th className="px-6 py-3 text-left">Student Name</th>
                      <th className="px-4 py-3 text-left">Subject</th>
                      <th className="px-4 py-3 text-left">Pace No.</th>
                      <th className="px-4 py-3 text-left">Schedule Date</th>
                      <th className="px-4 py-3 text-left">Schedule Time</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((t) => (
                      <tr key={t.pts_id} className={`border-b border-outline-variant/10 transition-colors ${t.pts_id === selId ? "bg-primary/5" : "hover:bg-surface-container-lowest/40"}`}>
                        <td className="px-6 py-3 font-bold text-on-surface">{t.studentName}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{t.subject}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{t.paceNumber ?? "—"}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{fmtDate(t.scheduledAt)}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{fmtTime(t.scheduledAt)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${STATUS_STYLE[t.status] ?? "bg-slate-100 text-slate-500"}`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openDetails(t)}
                            className="px-4 py-1.5 border border-gray-200 text-on-surface text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
                <p className="text-xs text-on-surface-variant">Showing {startIdx} to {endIdx} of {tests.length} entries</p>
                <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </div>

        {/* Schedule details */}
        {selected && (
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 mt-6 max-w-4xl">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">Schedule Details</h3>
              <button onClick={() => setSelId(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Student */}
                <div>
                  <p className="text-[13px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Student Information</p>
                  <p className="text-base font-extrabold text-on-surface">{selected.studentName}</p>
                  <p className="text-sm text-on-surface-variant">{selected.gradeLevel}</p>
                  <span className="inline-block mt-2 bg-green-100 text-green-700 text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full">{selected.studentType}</span>
                </div>

                {/* PACE */}
                <div className="space-y-2">
                  <p className="text-[13px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">PACE Information</p>
                  <DetailRow label="Subject" value={selected.subject} />
                  <DetailRow label="PACE Number" value={selected.paceNumber ?? "—"} />
                  <DetailRow label="PACE Test Eligibility" value={
                    <span className={selected.eligibility === "Ready" ? "text-green-600 font-bold" : "text-orange-600 font-bold"}>{selected.eligibility}</span>
                  } />
                </div>

                {/* Schedule */}
                <div className="space-y-2">
                  <p className="text-[13px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Schedule Information</p>
                  {editing ? (
                    <>
                      <EditRow label="Schedule Date"><input type="date" value={editVals.date} onChange={(e) => setEditVals((v) => ({ ...v, date: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" /></EditRow>
                      <EditRow label="Schedule Time"><input type="time" value={editVals.time} onChange={(e) => setEditVals((v) => ({ ...v, time: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" /></EditRow>
                      <DetailRow label="Venue" value={selected.gradeLevel} />
                    </>
                  ) : (
                    <>
                      <DetailRow label="Schedule Date" value={fmtDate(selected.scheduledAt)} />
                      <DetailRow label="Schedule Time" value={fmtTime(selected.scheduledAt)} />
                      <DetailRow label="Venue" value={selected.gradeLevel} />
                    </>
                  )}
                </div>
              </div>

              {/* Assessment status */}
              <div className="mt-8">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Assessment Status</p>
                {editing ? (
                  <select value={editVals.status} onChange={(e) => setEditVals((v) => ({ ...v, status: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {["Scheduled", "Rescheduled", "Completed", "Missed"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${STATUS_STYLE[selected.status] ?? "bg-slate-100 text-slate-500"}`}>{selected.status}</span>
                )}
                <p className="text-xs text-on-surface-variant mt-3">Scheduled by: {selected.scheduledBy}</p>
                <p className="text-xs text-on-surface-variant">Scheduled on: {fmtDateTime(selected.scheduledOn)}</p>
              </div>

              {detailErr && (
                <p className="mt-4 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">error</span>{detailErr}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50 transition-colors">Discard</button>
                    <button onClick={handleSaveEdit} disabled={saving || !editVals.date}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                      {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditing(true)} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-on-surface hover:bg-gray-50 transition-colors">Edit Schedule</button>
                    <button onClick={() => setConfirmCancel(true)} disabled={cancelling}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {cancelling ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base">cancel</span>}
                      Cancel Schedule
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={confirmCancel}
          tone="danger"
          icon="event_busy"
          title="Cancel PACE Test?"
          detail="This cancels the scheduled test."
          message={selected
            ? `Cancel the ${selected.subject} PACE ${selected.paceNumber ?? ""} test for ${selected.studentName}? The student will need a new schedule to take it.`
            : ""}
          confirmLabel="Cancel Schedule"
          cancelLabel="Keep Schedule"
          busy={cancelling}
          onConfirm={handleCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      </main>
    </TeacherLayout>
  );
}

const DetailRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-on-surface-variant">{label}</span>
    <span className="text-sm font-bold text-on-surface text-right">{value}</span>
  </div>
);
const EditRow = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-on-surface-variant">{label}</span>
    {children}
  </div>
);
