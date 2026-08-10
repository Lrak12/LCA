// Assign/Manage modal (opened from PaceMonitoring's footer). Per-PACE execution
// manager: current PACE per subject with status, dates, extensions, completion +
// points; a form assigns/edits one PACE. Backend: teacher.service
// getStudentPaceManage / saveStudentPace (/teacher/student-pace-manage).
import { useState, useEffect, useCallback } from "react";
import { fetchStudentPaceManage, saveStudentPace } from "../../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const SUBJECTS = [
  "English", "Mathematics", "Science", "Word Building", "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika", "Literature and Creative Writing",
];
const STATUS_OPTS = [
  { value: "Assigned",    label: "Not Yet Started" },
  { value: "In Progress", label: "Ongoing" },
  { value: "Completed",   label: "Completed" },
];

const QUARTER_LABELS = { 1: "1st Quarter", 2: "2nd Quarter", 3: "3rd Quarter", 4: "4th Quarter" };

// PACEs shown for one subject given the selected quarter. On-plan subjects
// (currentQuarter set) filter to the chosen quarter; off-plan subjects (currentQuarter
// null — assigned PACEs that fall outside the projected plan, e.g. catch-up PACEs) show
// only their actually-assigned PACEs so the whole projected range never leaks in. Never
// returns an empty list.
const visiblePaces = (row, quarter) => {
  const list = row.currentQuarter != null
    ? row.paces.filter((p) => p.quarter === quarter)
    : row.paces.filter((p) => p.sp_id != null);
  return list.length ? list : row.paces;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STATUS_BADGE = {
  "Completed":       "bg-green-100 text-green-700",
  "Ongoing":         "bg-orange-100 text-orange-700",
  "Overdue":         "bg-red-100 text-red-700",
  "Assigned":        "bg-blue-100 text-blue-700",
  "Not Yet Started": "bg-blue-100 text-blue-700",
};
const COMPLETION_BADGE = {
  "On Time":  "bg-green-100 text-green-700",
  "Extended": "bg-purple-100 text-purple-700",
  "Late":     "bg-orange-100 text-orange-700",
};

const LEGEND = [
  { label: "Completed/On-Time",      color: "bg-green-500"  },
  { label: "Overdue/Incomplete",     color: "bg-red-500"    },
  { label: "Extended",               color: "bg-purple-500" },
  { label: "Ongoing/Late",           color: "bg-orange-500" },
  { label: "Not Yet Started",        color: "bg-blue-500"   },
];

// one of the 4 summary cards (Completed/Ongoing/Remaining/Points)
const StatCard = ({ icon, iconColor, label, value, valueColor }) => (
  <div className="flex-1 min-w-[150px] border border-outline-variant/20 rounded-xl px-4 py-3 flex items-center gap-3">
    <span className={`material-symbols-outlined ${iconColor}`} style={fillStyle}>{icon}</span>
    <div>
      <p className="text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant leading-tight">{label}</p>
      <p className={`text-2xl font-extrabold ${valueColor}`}>{value}</p>
    </div>
  </div>
);

const blankForm = {
  sp_id: null, subject: SUBJECTS[0], pace_number: "", pace_title: "",
  status: "Assigned", assigned_date: "", start_date: "", end_date: "", extension_count: 0,
};

// Loads via fetchStudentPaceManage(studentId); saveStudentPace() saves, then
// reload + onSaved so the parent refreshes.
export default function AssignManagePaceModal({ studentId, onClose, onSaved }) {
  const [data,    setData]    = useState(null);     // API payload { student, stats, rows, moduleOptions }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState(null);     // null = no form open; else the PACE being edited
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState("");
  const [selPace, setSelPace] = useState({});       // subject -> selected pace number (dropdown state)
  const [quarterFilter, setQuarterFilter] = useState(1); // which quarter's PACEs the dropdowns show

  const load = useCallback(() => {
    if (!studentId) return;
    setLoading(true);
    fetchStudentPaceManage(studentId)
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  // Sync the quarter filter to the backend's suggested default when data loads.
  useEffect(() => {
    if (data?.defaultQuarter != null) setQuarterFilter(data.defaultQuarter);
  }, [data?.defaultQuarter]);

  // Default the per-subject PACE selection to a pace visible in the selected quarter.
  // Recomputed when the data OR the quarter filter changes (so switching quarters resets
  // each subject's dropdown to that quarter's current/first PACE).
  useEffect(() => {
    if (!data?.rows) return;
    setSelPace(() => {
      const next = {};
      data.rows.forEach((r) => {
        const vis = visiblePaces(r, quarterFilter);
        next[r.subject] = vis.some((p) => p.paceNumber === r.defaultPaceNumber)
          ? r.defaultPaceNumber
          : vis[0]?.paceNumber ?? null;
      });
      return next;
    });
  }, [data, quarterFilter]);

  // Open the details form for a specific PACE (Manage / View / Assign)
  const openForm = (subject, pace) => {
    setFormErr("");
    setForm({
      sp_id:           pace.sp_id,
      subject,
      pace_number:     pace.paceNumber ?? "",
      pace_title:      pace.paceTitle ?? "",
      status:          pace.status ?? "Assigned",
      assigned_date:   pace.assignedDate ?? "",
      start_date:      pace.startDate ?? "",
      end_date:        pace.endDate ?? "",
      extension_count: pace.extensionCount ?? 0,
    });
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // handleSave - POST the form as one student_pace upsert; the backend auto-computes
  //   completion_status + points when the status is Completed. Then reload + notify parent.
  const handleSave = async () => {
    if (!form.subject || !form.pace_number) { setFormErr("Subject and PACE number are required."); return; }
    setSaving(true);
    setFormErr("");
    try {
      await saveStudentPace({
        student_id:      studentId,
        subject:         form.subject,
        pace_number:     form.pace_number,
        status:          form.status,
        assigned_date:   form.assigned_date || null,
        start_date:      form.start_date || null,
        end_date:        form.end_date || null,
        extension_count: Number(form.extension_count) || 0,
      });
      setForm(null);
      load();
      onSaved?.();
    } catch (err) {
      setFormErr(err.response?.data?.message ?? err.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // Derived from the payload for the render below.
  const student = data?.student;
  const stats   = data?.stats ?? { completed: 0, ongoing: 0, remaining: 0, performancePoints: 0 };
  const rows    = data?.rows ?? [];   // one row per subject (each with its list of PACEs)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-white rounded-2xl shadow-xl border border-outline-variant/20 w-full max-w-6xl mx-4">

        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-8 py-6 border-b border-outline-variant/10">
          <div>
            <h2 className="text-lg font-extrabold text-on-surface uppercase tracking-wide">Assign / Manage Student PACE</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">View current PACE modules per subject and set dates, extensions, and other details.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-on-surface-variant">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="m-8 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        ) : (
          <div className="p-4 sm:p-8">

            {/* Student + stats */}
            <div className="flex flex-wrap items-start justify-between gap-6 mb-6">
              <div>
                <h3 className="text-xl font-extrabold text-on-surface">{student?.name}</h3>
                <span className="inline-block bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded mt-1">Student ID: {student?.idNumber}</span>
                <p className="text-sm text-on-surface-variant mt-2">Grade Level: <strong className="text-on-surface">{student?.gradeLevel}</strong></p>
                <p className="text-sm text-on-surface-variant">School Year: <strong className="text-on-surface">{student?.schoolYear}</strong></p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <StatCard icon="check_circle" iconColor="text-green-500"  label="Completed PACEs"   value={stats.completed}         valueColor="text-on-surface" />
                <StatCard icon="pending"      iconColor="text-orange-500" label="Ongoing PACEs"     value={stats.ongoing}           valueColor="text-on-surface" />
                <StatCard icon="info"         iconColor="text-blue-500"   label="Remaining PACEs"   value={stats.remaining}         valueColor="text-on-surface" />
                <StatCard icon="star"         iconColor="text-purple-500" label="Performance Points" value={stats.performancePoints} valueColor="text-on-surface" />
              </div>
            </div>

            {/* Legend + quarter filter */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h4 className="text-sm font-extrabold text-on-surface uppercase tracking-wide">Current PACE Modules Per Subject</h4>
                {/* Quarter filter: switches which quarter's PACEs the per-subject dropdowns show */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Quarter</span>
                  <select value={quarterFilter} onChange={(e) => setQuarterFilter(Number(e.target.value))}
                    className="border border-gray-200 rounded-lg pl-2 pr-7 py-1 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer bg-white">
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{QUARTER_LABELS[q]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap text-[11px] text-on-surface-variant">
                {LEGEND.map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />{l.label}</span>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-outline-variant/15 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container-lowest text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
                    <th className="px-3 py-3 text-left">Subject</th>
                    <th className="px-3 py-3 text-left">Current Pace</th>
                    <th className="px-3 py-3 text-left">Pace Title</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-left">Assigned Date</th>
                    <th className="px-3 py-3 text-left">Start Date</th>
                    <th className="px-3 py-3 text-left">Expected End Date</th>
                    <th className="px-3 py-3 text-left">Completion Date</th>
                    <th className="px-3 py-3 text-center">Completion Status</th>
                    <th className="px-3 py-3 text-center">Ext.</th>
                    <th className="px-3 py-3 text-center">Points</th>
                    <th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const visible = visiblePaces(r, quarterFilter);
                    const sel = visible.find((p) => p.paceNumber === selPace[r.subject]) ?? visible[0];
                    if (!sel) return null;
                    return (
                    <tr key={r.subject} className="border-t border-outline-variant/10 hover:bg-surface-container-lowest/40">
                      <td className="px-3 py-3 font-bold text-on-surface">{r.subject}</td>
                      <td className="px-3 py-3">
                        {visible.length > 1 ? (
                          <select value={sel.paceNumber ?? ""} onChange={(e) => setSelPace((m) => ({ ...m, [r.subject]: Number(e.target.value) }))}
                            className="border border-gray-200 rounded-lg pl-2 pr-8 py-1 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer bg-white">
                            {visible.map((p) => (
                              <option key={p.paceNumber} value={p.paceNumber}>PACE {p.paceNumber}{p.quarter ? ` · Q${p.quarter}` : ""}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-on-surface-variant">{sel.paceNumber != null ? `PACE ${sel.paceNumber}` : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-on-surface-variant">{sel.paceTitle ?? "—"}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[sel.displayStatus] ?? "bg-slate-100 text-slate-500"}`}>{sel.displayStatus}</span>
                      </td>
                      <td className="px-3 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(sel.assignedDate)}</td>
                      <td className="px-3 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(sel.startDate)}</td>
                      <td className="px-3 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(sel.endDate)}</td>
                      <td className="px-3 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(sel.completionDate)}</td>
                      <td className="px-3 py-3 text-center">
                        {sel.completionStatus
                          ? <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full whitespace-nowrap ${COMPLETION_BADGE[sel.completionStatus] ?? "bg-slate-100 text-slate-500"}`}>{sel.completionStatus}</span>
                          : <span className="text-on-surface-variant/50">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center text-on-surface-variant">{sel.extensionCount ?? 0}</td>
                      <td className="px-3 py-3 text-center font-bold text-on-surface">{sel.points ?? 0}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => openForm(r.subject, sel)}
                          className="px-3 py-1.5 border border-gray-200 text-on-surface text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                          {sel.action}
                        </button>
                      </td>
                    </tr>
                  ); })}
                  {!rows.length && (
                    <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-on-surface-variant">No PACE plan for this student yet. Assign one from the Returning Placement / projection flow first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Details form */}
            {form && (
              <div className="mt-6 border border-outline-variant/20 rounded-2xl p-6 bg-surface-container-lowest/40">
                <h4 className="text-sm font-extrabold text-on-surface uppercase tracking-wide mb-5">Assign / Manage PACE Details</h4>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  {/* Subject + PACE Number + Title identify the selected PACE — shown read-only, not
                      editable. The PACE is chosen via the table's "Current Pace" selector before this
                      form opens; this form only manages its status, dates, and extensions. */}
                  <Field label="Subject">
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold bg-gray-100 text-on-surface-variant cursor-not-allowed select-none truncate" title={form.subject || ""}>
                      {form.subject || "—"}
                    </div>
                  </Field>
                  <Field label="PACE Number">
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold bg-gray-100 text-on-surface-variant cursor-not-allowed select-none">
                      {form.pace_number !== "" && form.pace_number != null ? `PACE ${form.pace_number}` : "—"}
                    </div>
                  </Field>
                  <Field label="PACE Title">
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-100 text-on-surface-variant cursor-not-allowed select-none truncate" title={form.pace_title || ""}>
                      {form.pace_title || "—"}
                    </div>
                  </Field>
                  <Field label="Status">
                    <select value={form.status} onChange={(e) => setField("status", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20">
                      {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>

                  <Field label="Assigned Date *">
                    <input type="date" value={form.assigned_date ?? ""} onChange={(e) => setField("assigned_date", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </Field>
                  <Field label="Start Date">
                    <input type="date" value={form.start_date ?? ""} onChange={(e) => setField("start_date", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </Field>
                  <Field label="Expected End Date">
                    <input type="date" value={form.end_date ?? ""} onChange={(e) => setField("end_date", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </Field>
                  <Field label="Extensions Granted">
                    <input type="number" min="0" max="99" value={form.extension_count} onChange={(e) => setField("extension_count", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-2 text-xs text-blue-800">
                    <span className="material-symbols-outlined text-base shrink-0" style={fillStyle}>schedule</span>
                    <p>The system determines completion status (On Time, Late, or Extended) and computes points automatically based on the actual completion date and PACE test result.</p>
                  </div>
                  <div className="border border-outline-variant/20 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Points Guideline (set by principal)</p>
                    <ul className="text-xs text-on-surface-variant space-y-1">
                      <li className="flex justify-between"><span>On Time Completion (Passed)</span><span className="font-bold">= 10 points</span></li>
                      <li className="flex justify-between"><span>Extended Completion (Passed)</span><span className="font-bold">= 7 points</span></li>
                      <li className="flex justify-between"><span>Late Completion (Passed)</span><span className="font-bold">= 5 points</span></li>
                      <li className="flex justify-between"><span>Not Passed or Incomplete</span><span className="font-bold">= 0 points</span></li>
                    </ul>
                  </div>
                </div>

                {formErr && (
                  <p className="mt-4 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">error</span>{formErr}
                  </p>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setForm(null)} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50 transition-colors">Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
                    {saving ? "Saving…" : "Save PACE Assignment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
