// Projected PACE Plan modal (principal): final step of the diagnostic flow. Builds an
// editable 8-subject x 4-quarter PACE grid (3 PACEs per quarter) seeded from the accepted
// recommendation, then saves it as the student's projection. Opened from
// ProjectedPaceRecommendation.jsx.
// Backend chain (frontend api/diagnosticAssessments.js generateProjection -> routes/assessment.routes.js):
//   POST /assessments/diagnostic/generate-projection
//        -> controllers/assessment.controller.js > generateProjection (~line 60)
//        -> services/reports.service.js > generateDiagnosticProjection (~line 770)
import { useState } from "react";
import { generateProjection } from "../../api/diagnosticAssessments.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// Canonical 8-subject plan columns (storage key + display label).
const PLAN_SUBJECTS = [
  { key: "Mathematics",                                     label: "Mathematics" },
  { key: "English",                                         label: "English" },
  { key: "Social Studies",                                  label: "Social Studies" },
  { key: "Science",                                         label: "Science" },
  { key: "Word Building",                                   label: "Word Building" },
  { key: "Filipino",                                        label: "Filipino" },
  { key: "Sibika at Kultura/Heograpiya Kasaysayan at Sibika", label: "Sibika at Kultura / Heograpiya, Kasaysayan at Sibika" },
  { key: "Literature and Creative Writing",                 label: "Literature and Creative Writing" },
];
const QUARTERS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const DEFAULT_START = 1001;

// Map a recommended diagnostic start (by fuzzy subject name) to a plan column.
const matchStart = (subjectKey, recommended) => {
  const entries = Object.entries(recommended || {});
  const find = (pred) => entries.find(([s]) => pred(s.toLowerCase()))?.[1]; // first recommendation whose name matches
  if (subjectKey === "Mathematics")    return find((s) => s.includes("math"))    ?? DEFAULT_START;
  if (subjectKey === "English")        return find((s) => s.includes("english")) ?? DEFAULT_START;
  if (subjectKey === "Science")        return find((s) => s.includes("science")) ?? DEFAULT_START;
  if (subjectKey === "Social Studies") return find((s) => s.includes("social"))  ?? DEFAULT_START;
  return DEFAULT_START;                                // subjects with no diagnostic default to 1001
};

// dropdown options: a window around the current value (-3 to +15)
const startOptions = (val) => {
  const v = Number(val) || DEFAULT_START;
  const opts = [];
  for (let n = Math.max(1, v - 3); n <= v + 15; n++) opts.push(n);
  return opts;
};

// seed the grid: each subject's 4 quarter-start PACEs, 3 apart (consecutive blocks)
const buildInitial = (recommended) => {
  const g = {};
  PLAN_SUBJECTS.forEach(({ key }) => {
    const base = Number(matchStart(key, recommended)) || DEFAULT_START;
    g[key] = [base, base + 3, base + 6, base + 9]; // per-quarter starts (consecutive blocks)
  });
  return g;
};

export default function ProjectedPacePlanModal({ student, studentId, recommended, schoolYearLabel, onBack, onCancel, onSaved }) {
  const [grid,   setGrid]   = useState(() => buildInitial(recommended)); // subject -> [q1,q2,q3,q4] start PACEs
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const fullName  = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "—";
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // change one subject's start PACE for one quarter
  const setQuarterStart = (subjectKey, qi, value) =>
    setGrid((g) => ({ ...g, [subjectKey]: g[subjectKey].map((v, i) => (i === qi ? Number(value) : v)) }));

  // convert the grid into the API payload (per subject, per quarter: start + count of 3) and save
  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const paces = {};
      PLAN_SUBJECTS.forEach(({ key }) => {
        const starts = grid[key];
        paces[key] = {
          1: { start: starts[0], count: 3 },
          2: { start: starts[1], count: 3 },
          3: { start: starts[2], count: 3 },
          4: { start: starts[3], count: 3 },
        };
      });
      await generateProjection(studentId, paces); // persist the student's PACE projection
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-4 max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center">
              <span className="material-symbols-outlined text-lg" style={fillStyle}>assignment</span>
            </div>
            <h2 className="text-lg font-extrabold text-on-surface tracking-wide">
              PROJECTED PACE PLAN <span className="text-sm font-medium text-on-surface-variant">(School Year {schoolYearLabel})</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Preview / Print -> window.print() */}
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-sm">visibility</span> Preview / Print
            </button>
            {/* Reset Plan -> setGrid(buildInitial(recommended)) reseeds the grid from the recommendation */}
            <button onClick={() => setGrid(buildInitial(recommended))} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-sm">restart_alt</span> Reset Plan
            </button>
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="px-6 py-4 border-b border-outline-variant/10 grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student ID</p>
            <p className="text-sm font-bold text-on-surface mt-0.5">{student?.student_id ?? studentId}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student Name</p>
            <p className="text-sm font-bold text-on-surface mt-0.5 truncate">{fullName || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Grade Level</p>
            <p className="text-sm font-bold text-on-surface mt-0.5">{student?.grade_level?.level_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Placement Basis</p>
            <span className="inline-block mt-1 text-[11px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">Diagnostic Assessment</span>
          </div>
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Date Generated</p>
            <p className="text-sm font-bold text-on-surface mt-0.5">{generated}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-auto flex-1">
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-[12px] text-blue-800 mb-4">
            <span className="material-symbols-outlined text-base shrink-0 mt-0.5" style={fillStyle}>info</span>
            This plan shows the recommended PACE sequence for each subject for the entire school year. You may review and edit the plan before saving.
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-outline-variant/15">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest">
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant border-b border-outline-variant/15 whitespace-nowrap">Quarter / Subject</th>
                  {PLAN_SUBJECTS.map((s) => (
                    <th key={s.key} className="px-2 py-3 text-center text-[10px] font-extrabold text-on-surface-variant border-b border-outline-variant/15 min-w-[96px] leading-tight">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {QUARTERS.map((ql, qi) => (
                  [0, 1, 2].map((slot) => (
                    <tr key={`${qi}-${slot}`} className="border-b border-outline-variant/10">
                      {slot === 0 && (
                        <td rowSpan={3} className="px-3 py-2 font-bold text-on-surface align-top border-r border-outline-variant/10 whitespace-nowrap">{ql}</td>
                      )}
                      {PLAN_SUBJECTS.map((s) => {
                        const start = grid[s.key][qi];
                        const value = start + slot;
                        return (
                          <td key={s.key} className="px-2 py-1.5">
                            {/* each cell -> setQuarterStart(subject, quarter, value) edits the grid */}
                            <select
                              value={value}
                              onChange={(e) => setQuarterStart(s.key, qi, Math.max(1, Number(e.target.value) - slot))}
                              className="w-full px-2 py-1.5 rounded-lg border border-outline-variant/40 bg-white text-on-surface focus:outline-none focus:border-primary"
                            >
                              {startOptions(value).map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center justify-between gap-4 shrink-0 flex-wrap">
          <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">edit</span>
            You can edit the projected PACEs manually. All changes will be saved for this student.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onCancel} disabled={saving} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60">
              Cancel
            </button>
            <button onClick={onBack} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Recommendation
            </button>
            {/* Save Projection -> handleSave() (generateProjection, then onSaved) ; Back -> onBack, Cancel -> onCancel */}
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-lg shadow-primary/20">
              {saving
                ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Saving…</>
                : <><span className="material-symbols-outlined text-base" style={fillStyle}>save</span> Save Projection</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
