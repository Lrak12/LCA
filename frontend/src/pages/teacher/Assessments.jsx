// Record Self-Test and PACE-Test scores per student, per PACE. Rules: self-test
// READY = average of attempts >= 90; PACE test is locked until READY, and passes at
// any attempt >= 90. Backend: teacher.service getStudentAssessments / recordSelfTest
// / recordPaceTest (under /teacher/record-assessments).
import { useState, useEffect, useCallback } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import {
  fetchTeacherStudents,
  fetchStudentAssessments,
  recordSelfTest,
  recordPaceTest,
} from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// fmtDate - short date for the attempts tables ("Jul 10, 2026"), or a dash if none.
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// STATUS_BADGE - pill colours per PACE row status (Completed / Ready / In Progress / Not Ready).
const STATUS_BADGE = {
  "Completed":   "bg-emerald-100 text-emerald-700",
  "Ready":       "bg-green-100 text-green-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Not Ready":   "bg-red-100 text-red-600",
};

// ─── Self-Test Recording (full view) ─────────────────────────────────────────
// small labelled icon card (Student / Subject / PACE No.)
function InfoCard({ icon, label, value }) {
  return (
    <div className="flex-1 min-w-[180px] border border-outline-variant/20 rounded-xl px-5 py-4 flex items-center gap-3">
      <span className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center">
        <span className="material-symbols-outlined text-on-surface-variant text-lg" style={fillStyle}>{icon}</span>
      </span>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">{label}</p>
        <p className="text-base font-extrabold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

// Full-page self-test recorder for one PACE: attempts table + summary + add form.
// recordSelfTest() saves, then onRecorded() reloads; onBack() returns to the list.
function SelfTestRecordingView({ row, student, passMark, onBack, onRecorded }) {
  const st = row.selfTest;                              // this PACE's self-test data from the API
  const [open,   setOpen]   = useState(false);   // is the "record attempt" form open?
  const [score,  setScore]  = useState("");            // score input value
  const [date,   setDate]   = useState(new Date().toISOString().split("T")[0]); // date input (defaults today)
  const [saving, setSaving] = useState(false);         // save in flight
  const [error,  setError]  = useState("");            // inline validation/save error

  const nextAttempt = st.attemptsUsed + 1;             // which attempt # the form will create

  // handleSave - validate 0-100, POST the attempt, then refresh + close the form.
  const handleSave = async () => {
    const sc = Number(score);
    if (isNaN(sc) || sc < 0 || sc > 100) { setError("Enter a score between 0 and 100."); return; }
    setSaving(true);
    setError("");
    try {
      await recordSelfTest({ sp_id: row.sp_id, score: sc, date_taken: date }); // POST .../self-test
      setOpen(false);
      setScore("");
      onRecorded();                                     // parent reloads the assessments
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to record.");
    } finally {
      setSaving(false);
    }
  };

  // Always render 3 fixed rows; fill each with its recorded attempt or null (empty).
  const slots = [1, 2, 3].map((n) => st.attempts.find((a) => a.attempt === n) ?? null);

  return (
    <>
      {/* Header */}
      <header className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-9 h-9 mt-1 flex items-center justify-center rounded-lg border border-outline-variant/30 hover:bg-surface-container-low text-on-surface">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-primary uppercase">Self-Test Recording</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Manage Self-Test attempts. Students must score {passMark}% and above to be READY.</p>
          </div>
        </div>
        <button onClick={onBack} className="text-sm font-bold text-primary border border-primary/30 rounded-xl px-4 py-2 hover:bg-primary/5 transition-colors whitespace-nowrap">
          Back to PACE List
        </button>
      </header>

      {/* Info cards */}
      <div className="flex gap-4 flex-wrap mb-6">
        <InfoCard icon="person" label="Student" value={`${student?.name ?? "—"}${student?.gradeLevel ? ` (${student.gradeLevel})` : ""}`} />
        <InfoCard icon="menu_book" label="Subject" value={row.subject} />
        <InfoCard icon="tag" label="PACE No." value={row.paceNumber ?? "—"} />
      </div>

      {/* Attempts table */}
      <div className="border border-outline-variant/15 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-lowest text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
              <th className="px-5 py-3 text-left">Attempt No.</th>
              <th className="px-5 py-3 text-left">Score (%)</th>
              <th className="px-5 py-3 text-left">Passed</th>
              <th className="px-5 py-3 text-left">Date Taken</th>
              <th className="px-5 py-3 text-left">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((a, i) => (
              <tr key={i} className="border-t border-outline-variant/10">
                <td className="px-5 py-4 font-bold text-on-surface">{i + 1}</td>
                <td className={`px-5 py-4 font-extrabold ${a ? (a.passed ? "text-green-600" : "text-red-500") : "text-on-surface-variant/40"}`}>{a ? `${a.score}%` : "—"}</td>
                <td className="px-5 py-4">
                  {a ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${a.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      <span className="material-symbols-outlined text-sm">{a.passed ? "check" : "close"}</span>{a.passed ? "Yes" : "No"}
                    </span>
                  ) : <span className="text-on-surface-variant/40">—</span>}
                </td>
                <td className="px-5 py-4 text-on-surface-variant">{a ? fmtDate(a.date) : "—"}</td>
                <td className="px-5 py-4 text-on-surface-variant">{a?.recordedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center">
        <div className="py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1">Current Average</p>
          <p className="text-3xl font-extrabold text-on-surface">{st.average != null ? `${st.average}%` : "—"}</p>
        </div>
        <div className="py-2 md:border-x border-outline-variant/15">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Readiness Status</p>
          <span className={`text-sm font-extrabold px-4 py-1.5 rounded-full ${st.ready ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {st.ready ? "READY" : "NOT READY"}
          </span>
        </div>
        <div className="py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1">Attempts Used</p>
          <p className="text-3xl font-extrabold text-on-surface">{st.attemptsUsed} / 3</p>
        </div>
      </div>

      {/* Record attempt */}
      {st.canRecord ? (
        open ? (
          <div className="max-w-md mx-auto border border-outline-variant/20 rounded-2xl p-5 mb-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">Record Attempt {nextAttempt}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Score (%)</label>
                <input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Date Taken</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600 font-semibold flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">error</span>{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setOpen(false); setError(""); }} className="px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || score === ""}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-4">
            <button onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Record Attempt {nextAttempt}
            </button>
          </div>
        )
      ) : (
        <p className="text-center text-sm text-on-surface-variant mb-4">All 3 self-test attempts have been recorded.</p>
      )}

      {/* Footer note */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-purple-800">
        <span className="material-symbols-outlined text-base" style={fillStyle}>info</span>
        Students are considered READY only if the average of Self-Tests is {passMark}% and above.
      </div>
    </>
  );
}

// ─── PACE Test Recording (full view) ─────────────────────────────────────────
// Same as the self-test view but for the PACE test: shows latest score (not
// average), PASSED/FAILED, and a Venue column (= grade level). recordPaceTest() saves.
function PaceTestRecordingView({ row, student, passMark, onBack, onRecorded }) {
  const pt = row.paceTest;                             // this PACE's pace-test data from the API
  const [open,   setOpen]   = useState(false);         // add-attempt form open?
  const [score,  setScore]  = useState("");
  const [date,   setDate]   = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const nextAttempt = pt.attemptsUsed + 1;
  const venue = student?.gradeLevel ?? "—";            // Venue column = student's grade level (no schema field)

  // handleSave - validate 0-100, POST the attempt, then refresh + close the form.
  const handleSave = async () => {
    const sc = Number(score);
    if (isNaN(sc) || sc < 0 || sc > 100) { setError("Enter a score between 0 and 100."); return; }
    setSaving(true);
    setError("");
    try {
      await recordPaceTest({ sp_id: row.sp_id, score: sc, date_taken: date }); // POST .../pace-test
      setOpen(false);
      setScore("");
      onRecorded();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to record.");
    } finally {
      setSaving(false);
    }
  };

  const slots = [1, 2, 3].map((n) => pt.attempts.find((a) => a.attempt === n) ?? null); // 3 fixed rows (attempt or null)

  return (
    <>
      <header className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-9 h-9 mt-1 flex items-center justify-center rounded-lg border border-outline-variant/30 hover:bg-surface-container-low text-on-surface">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-primary uppercase">PACE Test Recording</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Record official PACE Test scores. PACE Test score of {passMark}% and above is PASSED.</p>
          </div>
        </div>
        <button onClick={onBack} className="text-sm font-bold text-primary border border-primary/30 rounded-xl px-4 py-2 hover:bg-primary/5 transition-colors whitespace-nowrap">
          Back to PACE List
        </button>
      </header>

      <div className="flex gap-4 flex-wrap mb-6">
        <InfoCard icon="person" label="Student" value={`${student?.name ?? "—"}${student?.gradeLevel ? ` (${student.gradeLevel})` : ""}`} />
        <InfoCard icon="menu_book" label="Subject" value={row.subject} />
        <InfoCard icon="tag" label="PACE No." value={row.paceNumber ?? "—"} />
      </div>

      <div className="border border-outline-variant/15 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-lowest text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
              <th className="px-5 py-3 text-left">Attempt No.</th>
              <th className="px-5 py-3 text-left">Score (%)</th>
              <th className="px-5 py-3 text-left">Passed</th>
              <th className="px-5 py-3 text-left">Date Taken</th>
              <th className="px-5 py-3 text-left">Venue</th>
              <th className="px-5 py-3 text-left">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((a, i) => (
              <tr key={i} className="border-t border-outline-variant/10">
                <td className="px-5 py-4 font-bold text-on-surface">{i + 1}</td>
                <td className={`px-5 py-4 font-extrabold ${a ? (a.passed ? "text-green-600" : "text-red-500") : "text-on-surface-variant/40"}`}>{a ? `${a.score}%` : "—"}</td>
                <td className="px-5 py-4">
                  {a ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${a.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      <span className="material-symbols-outlined text-sm">{a.passed ? "check" : "close"}</span>{a.passed ? "Yes" : "No"}
                    </span>
                  ) : <span className="text-on-surface-variant/40">—</span>}
                </td>
                <td className="px-5 py-4 text-on-surface-variant">{a ? fmtDate(a.date) : "—"}</td>
                <td className="px-5 py-4 text-on-surface-variant">{a ? venue : "—"}</td>
                <td className="px-5 py-4 text-on-surface-variant">{a?.recordedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center">
        <div className="py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1">Latest Score</p>
          <p className={`text-3xl font-extrabold ${pt.latestScore != null ? (pt.passed ? "text-green-600" : "text-red-500") : "text-on-surface"}`}>{pt.latestScore != null ? `${pt.latestScore}%` : "—"}</p>
        </div>
        <div className="py-2 md:border-x border-outline-variant/15">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Assessment Status</p>
          <span className={`text-sm font-extrabold px-4 py-1.5 rounded-full ${pt.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {pt.passed ? "PASSED" : "FAILED"}
          </span>
        </div>
        <div className="py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1">Attempts Used</p>
          <p className="text-3xl font-extrabold text-on-surface">{pt.attemptsUsed} / 3</p>
        </div>
      </div>

      {pt.passed ? (
        <p className="text-center text-sm font-bold text-green-700 mb-4">PACE Test passed — no further attempts needed.</p>
      ) : pt.canRecord ? (
        open ? (
          <div className="max-w-md mx-auto border border-outline-variant/20 rounded-2xl p-5 mb-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">Record Attempt {nextAttempt}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Score (%)</label>
                <input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant mb-1">Date Taken</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600 font-semibold flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">error</span>{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setOpen(false); setError(""); }} className="px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || score === ""}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-4">
            <button onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Record Attempt {nextAttempt}
            </button>
          </div>
        )
      ) : (
        <p className="text-center text-sm text-on-surface-variant mb-4">All 3 PACE test attempts have been recorded.</p>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-blue-800">
        <span className="material-symbols-outlined text-base" style={fillStyle}>info</span>
        Students have up to 3 attempts for the PACE Test. Final passing score is {passMark}% and above.
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// Student picker + that student's current PACE per subject; the Record/View buttons
// swap in the recording views above. Loads via fetchTeacherStudents +
// fetchStudentAssessments.
export default function Assessments() {
  const schoolYearLabel = useSchoolYear();

  const [students,  setStudents]  = useState([]);      // dropdown options
  const [selId,     setSelId]     = useState(null);    // selected student_id
  const [data,      setData]      = useState(null);    // that student's assessments payload
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [rec,       setRec]       = useState(null); // which recording view is open: { sp_id, kind:'self'|'pace' } or null

  // Load the student dropdown once; auto-select the first student.
  useEffect(() => {
    fetchTeacherStudents()
      .then((res) => {
        const list = res.data ?? [];
        setStudents(list);
        if (list.length) setSelId(list[0].student_id);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load students."));
  }, []);

  // load - fetch the selected student's assessments. useCallback so the effect below
  //   re-runs only when selId changes; also reused as onRecorded() after each save.
  const load = useCallback(() => {
    if (!selId) return;
    setLoading(true);
    setError("");
    fetchStudentAssessments(selId)                     // GET /record-assessments?student_id=
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load assessments."))
      .finally(() => setLoading(false));
  }, [selId]);

  useEffect(() => { load(); }, [load]);                // reload whenever the selected student changes

  const rows     = data?.rows ?? [];                   // one row per current PACE (per subject)
  const passMark = data?.passMark ?? 90;               // pass threshold from the backend
  const recRow   = rec ? rows.find((r) => r.sp_id === rec.sp_id) ?? null : null; // the PACE being recorded, if any

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {/* The page renders one of 3 states: the Self-Test recording view, the
            PACE-Test recording view, or (default) the student picker + Assigned
            PACEs table. `rec` decides which; onBack sets it back to null. */}
        {recRow && rec.kind === "self" ? (
          <SelfTestRecordingView
            row={recRow}
            student={data?.student}
            passMark={passMark}
            onBack={() => setRec(null)}
            onRecorded={load}
          />
        ) : recRow && rec.kind === "pace" ? (
          <PaceTestRecordingView
            row={recRow}
            student={data?.student}
            passMark={passMark}
            onBack={() => setRec(null)}
            onRecorded={load}
          />
        ) : (
        <>
        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary uppercase">Record Assessments</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Record and manage scores for Self-Tests and PACE Tests.</p>
            <p className="text-on-surface-variant text-sm">Grading basis for PACE Test: {passMark}% and above is Passed.</p>
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

        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-7">

          {/* Search student */}
          <label className="block text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Search Student</label>
          <div className="relative max-w-md mb-7">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none" style={fillStyle}>person</span>
            <select value={selId ?? ""} onChange={(e) => setSelId(e.target.value ? parseInt(e.target.value, 10) : null)} disabled={!students.length}
              className="w-full pl-9 pr-10 py-2.5 text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}>
              {students.length === 0
                ? <option value="">No students found</option>
                : students.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.first_name} {s.last_name} {s.grade_level?.level_name ? `(${s.grade_level.level_name})` : ""}
                  </option>
                ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-xl leading-none text-on-surface-variant pointer-events-none">expand_more</span>
          </div>

          {/* Assigned PACEs */}
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">Assigned PACEs</p>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-outline-variant/15 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container-lowest text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                    <th className="px-4 py-3 text-left">Subject</th>
                    <th className="px-4 py-3 text-left">Pace No.</th>
                    <th className="px-4 py-3 text-center">Self-Test<br /><span className="font-semibold normal-case tracking-normal text-[9px]">(up to 3 attempts)</span></th>
                    <th className="px-4 py-3 text-center">PACE-Test<br /><span className="font-semibold normal-case tracking-normal text-[9px]">(up to 3 attempts)</span></th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-on-surface-variant">No assigned PACEs for this student yet.</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.sp_id} className="border-t border-outline-variant/10 hover:bg-surface-container-lowest/40">
                      <td className="px-4 py-3 font-bold text-on-surface">{r.subject}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{r.paceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setRec({ sp_id: r.sp_id, kind: "self" })}
                          className="px-4 py-1.5 border border-primary/40 text-primary text-xs font-bold rounded-lg hover:bg-primary/5 transition-colors">
                          Record / View
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.paceTest.available ? (
                          <button onClick={() => setRec({ sp_id: r.sp_id, kind: "pace" })}
                            className="px-4 py-1.5 border border-primary/40 text-primary text-xs font-bold rounded-lg hover:bg-primary/5 transition-colors">
                            Record / View
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-on-surface-variant/50 cursor-not-allowed" title="Pass the self-test first">
                            Not Available <span className="material-symbols-outlined text-sm">lock</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}
      </main>
    </TeacherLayout>
  );
}
