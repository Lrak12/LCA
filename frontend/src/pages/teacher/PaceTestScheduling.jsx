import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchPaceTestScheduling, updatePaceTestSchedule } from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const PAGE_SIZE = 6;

const QUARTER_OPTS = [
  { value: "1", label: "1st Quarter" },
  { value: "2", label: "2nd Quarter" },
  { value: "3", label: "3rd Quarter" },
  { value: "4", label: "4th Quarter" },
];

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatShortDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, tint }) => (
  <div className={`rounded-2xl border p-5 ${tint.bg} ${tint.border}`}>
    <p className={`text-xs font-extrabold ${tint.label}`}>{label}</p>
    <p className={`text-4xl font-extrabold mt-2 ${tint.value}`}>{value}</p>
  </div>
);

const TINTS = {
  ready:     { bg: "bg-green-50",  border: "border-green-200",  label: "text-green-700",  value: "text-green-600"  },
  scheduled: { bg: "bg-blue-50",   border: "border-blue-200",   label: "text-blue-700",   value: "text-blue-600"   },
  pending:   { bg: "bg-purple-50", border: "border-purple-200", label: "text-purple-700", value: "text-purple-600" },
};

// ─── Schedule Form (inline panel) ─────────────────────────────────────────────
function ScheduleForm({ row, onSubmit, onCancel, saving, error }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 mt-6">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
        <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">Schedule PACE Test</h3>
        <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Student Name"><ReadOnly value={row.name} /></Field>
          <Field label="Grade Level"><ReadOnly value={row.gradeLevel} /></Field>
          <Field label="Subject"><ReadOnly value={row.subject} /></Field>
          <Field label="PACE Number"><ReadOnly value={row.currentPace ?? "—"} /></Field>
          <Field label="Assessment Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </Field>
          <Field label="Assessment Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </Field>
        </div>

        {error && (
          <p className="mt-4 text-xs text-red-600 font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">error</span>{error}
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSubmit({ scheduled_date: date, scheduled_time: time })}
            disabled={saving || !date}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <span className="material-symbols-outlined text-base" style={fillStyle}>event_available</span>}
            {saving ? "Scheduling…" : "Schedule Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1.5">{label}</label>
    {children}
  </div>
);

const ReadOnly = ({ value }) => (
  <div className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-bold text-on-surface">{value}</div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PaceTestScheduling() {
  const schoolYearLabel = useSchoolYear();
  const navigate = useNavigate();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [subject,  setSubject]  = useState("all");
  const [quarter,  setQuarter]  = useState("1");
  const [page,     setPage]     = useState(1);
  const [refresh,  setRefresh]  = useState(0);

  const [formRow,  setFormRow]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState("");
  const [okMsg,    setOkMsg]    = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchPaceTestScheduling({ subject, quarter })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [subject, quarter]);

  useEffect(() => { load(); }, [load, refresh]);
  useEffect(() => { setPage(1); }, [search, subject, quarter]);

  const stats    = data?.stats ?? { ready: 0, scheduledThisWeek: 0, pending: 0 };
  const subjects = data?.subjects ?? [];
  const allRows  = (data?.students ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const pageRows   = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const startIdx   = allRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endIdx     = Math.min(page * PAGE_SIZE, allRows.length);

  const handleSubmit = async ({ scheduled_date, scheduled_time }) => {
    if (!formRow) return;
    setSaving(true);
    setFormErr("");
    try {
      // The row is a pending request — schedule it by setting date/time + status.
      await updatePaceTestSchedule(formRow.pts_id, {
        scheduled_date,
        scheduled_time,
        status: "Scheduled",
      });
      setOkMsg(`Scheduled ${formRow.name} — ${formRow.subject} PACE ${formRow.currentPace}.`);
      setFormRow(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      setFormErr(err.response?.data?.message ?? err.message ?? "Failed to schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest mb-2">
          <button onClick={() => navigate("/teacher/pace")} className="text-on-surface-variant hover:text-primary transition-colors">
            PACE Monitoring
          </button>
          <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
          <span className="text-secondary">PACE Test Scheduling</span>
        </nav>

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">PACE TEST SCHEDULING</h2>
            <p className="text-on-surface-variant mt-1">Schedule PACE assessments for students who have met the readiness requirements.</p>
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
        {okMsg && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-100 text-green-700 text-sm flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{okMsg}</span>
            <button onClick={() => setOkMsg("")} className="text-green-700/70 hover:text-green-700"><span className="material-symbols-outlined text-base">close</span></button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <StatCard label="Ready for PACE Test" value={stats.ready} tint={TINTS.ready} />
          <StatCard label="Scheduled This Week" value={stats.scheduledThisWeek} tint={TINTS.scheduled} />
          <StatCard label="Pending Schedule" value={stats.pending} tint={TINTS.pending} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
            <input type="text" placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm" />
            {/* clear (×) -> empty the box */}
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none">close</button>
            )}
          </div>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}
            className=" text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
            <option value="all">All Subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
            className=" text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
            {QUARTER_OPTS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/20">
            <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">Students Ready for PACE Test</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : !allRows.length ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3 block" style={fillStyle}>event_available</span>
              <p className="text-base font-bold text-on-surface">No pending PACE test requests</p>
              <p className="text-sm text-on-surface-variant mt-1">Requests appear here when a student who passed the self-test (≥ 90) requests to take the PACE test.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                      <th className="px-6 py-3 text-left">Student Name</th>
                      <th className="px-4 py-3 text-left">Grade Level</th>
                      <th className="px-4 py-3 text-left">Subject</th>
                      <th className="px-4 py-3 text-center">Current Pace</th>
                      <th className="px-4 py-3 text-center">Self-Test Score</th>
                      <th className="px-4 py-3 text-center">Readiness Status</th>
                      <th className="px-4 py-3 text-left">Requested On</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.pts_id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40 transition-colors">
                        <td className="px-6 py-3 font-bold text-on-surface">{r.name}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{r.gradeLevel}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{r.subject}</td>
                        <td className="px-4 py-3 text-center font-bold text-on-surface">{r.currentPace ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-on-surface-variant">
                          {r.selfTestScore != null ? `${r.selfTestScore}% (Passed)` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-green-100 text-green-700 text-[10px] font-extrabold px-2.5 py-1 rounded-full">{r.readiness}</span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">{formatShortDate(r.requestedDate)}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => { setFormErr(""); setOkMsg(""); setFormRow(r); }}
                            className="px-4 py-1.5 bg-[#0d1b2e] text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                            Schedule
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-6 py-4 flex-wrap gap-3">
                <p className="text-xs text-on-surface-variant">
                  Showing {startIdx} to {endIdx} of {allRows.length} entries
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                        p === page ? "bg-primary text-white" : "border border-gray-200 text-on-surface-variant hover:bg-gray-50"
                      }`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Info note */}
        <div className="mt-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={fillStyle}>info</span>
          Only students with “Ready” status can be scheduled for PACE Test.
        </div>

        {/* Inline schedule form */}
        {formRow && (
          <ScheduleForm
            row={formRow}
            onSubmit={handleSubmit}
            onCancel={() => setFormRow(null)}
            saving={saving}
            error={formErr}
          />
        )}
      </main>
    </TeacherLayout>
  );
}
