// Projected PACE Plan modal (principal): final step of the diagnostic flow. Builds an
// editable 8-subject x 4-quarter PACE grid (3 PACEs per quarter) seeded from the accepted
// recommendation, then saves it as the student's projection. Opened from
// ProjectedPaceRecommendation.jsx.
// Backend chain (frontend api/diagnosticAssessments.js generateProjection -> routes/assessment.routes.js):
//   POST /assessments/diagnostic/generate-projection
//        -> controllers/assessment.controller.js > generateProjection (~line 60)
//        -> services/reports.service.js > generateDiagnosticProjection (~line 770)
import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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

// seed the grid from an already-saved projection (the getStudentProfile `subjectPaces`
// shape: subject -> { quarters: [{ paces: [start, start+1, start+2] }, ...] }). Used when
// the modal is opened to EDIT an existing plan (e.g. from Student Monitoring) rather than
// to create one from a diagnostic recommendation.
const buildFromProjection = (subjectPaces) => {
  const g = {};
  PLAN_SUBJECTS.forEach(({ key }) => {
    const quarters = subjectPaces?.[key]?.quarters ?? [];
    g[key] = [0, 1, 2, 3].map((qi) => {
      const start = Number(quarters[qi]?.paces?.[0]);
      return Number.isFinite(start) && start > 0 ? start : DEFAULT_START + qi * 3;
    });
  });
  return g;
};

// Rendered by <ProjectedPaceRecommendation> (planPaces). onBack = () => setPlanPaces(null)
// (back to the recommendation); onCancel + onSaved both navigate("/admin/diagnostic").
export default function ProjectedPacePlanModal({ student, studentId, recommended, initialProjection, hideBackToRecommendation = false, schoolYearLabel, onBack, onCancel, onSaved }) {
  // Seed from an existing saved plan when editing (initialProjection), otherwise from the
  // accepted diagnostic recommendation. Reset Plan reseeds from the same source.
  const seed = () => (initialProjection ? buildFromProjection(initialProjection) : buildInitial(recommended));
  const [grid,   setGrid]   = useState(seed); // subject -> [q1,q2,q3,q4] start PACEs
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const fullName  = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "—";
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const sid        = student?.student_id ?? studentId;
  const gradeLevel = student?.grade_level?.level_name ?? student?.grade_level ?? "—";

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

  // Print/Export both render the CURRENT grid (each quarter's 3 PACEs = its start + slot
  // offset), so the output always matches what's on screen after any edits.
  const cellVal = (key, qi, slot) => (grid[key]?.[qi] ?? DEFAULT_START) + slot;

  // Print = open a clean, standalone window with just the plan and trigger the print
  // dialog. It only prints — Export (below) is the one that downloads a PDF.
  const handlePrint = () => {
    const esc = (v) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const head = PLAN_SUBJECTS.map((s) => `<th>${esc(s.label)}</th>`).join("");
    const body = QUARTERS.map((ql, qi) =>
      [0, 1, 2].map((slot) => {
        const qCell = slot === 0 ? `<td class="q" rowspan="3">${esc(ql)}</td>` : "";
        const cells = PLAN_SUBJECTS.map((s) => `<td>${esc(cellVal(s.key, qi, slot))}</td>`).join("");
        return `<tr>${qCell}${cells}</tr>`;
      }).join(""),
    ).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>Projected PACE Plan - ${esc(fullName || sid)}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; padding:28px; }
        h1 { font-size:20px; margin:0 0 2px; }
        .sub { color:#555; font-size:12px; margin:0 0 18px; }
        .meta { font-size:13px; margin-bottom:18px; }
        .meta div { margin:2px 0; }
        table { border-collapse:collapse; width:100%; font-size:12px; }
        th, td { border:1px solid #ccc; padding:6px 10px; text-align:center; }
        th { background:#f3f4f6; }
        td.q { font-weight:bold; text-align:left; background:#fafafa; white-space:nowrap; }
        @media print { body { padding:0; } }
      </style></head>
      <body>
        <h1>Projected PACE Plan</h1>
        <p class="sub">Projected PACE sequence for each subject for the entire school year.</p>
        <div class="meta">
          <div><strong>Student:</strong> ${esc(fullName || "—")} (ID: ${esc(sid)})</div>
          <div><strong>Grade Level:</strong> ${esc(gradeLevel)}</div>
          <div><strong>Date Generated:</strong> ${esc(generated)}</div>
        </div>
        <table><thead><tr><th>Quarter</th>${head}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) { setError("Please allow pop-ups to print the plan."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  // Export = download the plan straight to a PDF (jsPDF + autotable). No print dialog,
  // no extra tab — the file is saved directly.
  const handleExport = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const marginX = 40;
    let y = 48;

    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(26, 26, 26);
    doc.text("Projected PACE Plan", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(85, 85, 85);
    doc.text("Projected PACE sequence for each subject for the entire school year.", marginX, y);
    y += 22;

    doc.setFontSize(11).setTextColor(26, 26, 26);
    const meta = [
      ["Student:", `${fullName || "—"} (ID: ${sid})`],
      ["Grade Level:", `${gradeLevel}`],
      ["Date Generated:", `${generated}`],
    ];
    meta.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold").text(label, marginX, y);
      doc.setFont("helvetica", "normal").text(value, marginX + 92, y);
      y += 15;
    });
    y += 8;

    const body = QUARTERS.flatMap((ql, qi) =>
      [0, 1, 2].map((slot) => {
        const row = [];
        if (slot === 0) row.push({ content: ql, rowSpan: 3, styles: { fontStyle: "bold", valign: "middle", halign: "left" } });
        PLAN_SUBJECTS.forEach((s) => row.push(String(cellVal(s.key, qi, slot))));
        return row;
      }),
    );
    autoTable(doc, {
      startY: y,
      head: [["Quarter", ...PLAN_SUBJECTS.map((s) => s.label)]],
      body,
      styles: { fontSize: 8, halign: "center", lineColor: [204, 204, 204], lineWidth: 0.5, cellPadding: 4 },
      headStyles: { fillColor: [243, 244, 246], textColor: [26, 26, 26], fontStyle: "bold" },
      margin: { left: marginX, right: marginX },
    });

    const safeName = String(fullName || sid).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    doc.save(`Projected_PACE_Plan_${safeName || sid}.pdf`);
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
            {/* Export -> downloads the plan as a PDF (handleExport, jsPDF); Print -> opens a clean standalone print view (handlePrint) */}
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-sm">download</span> Export
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-sm">print</span> Print
            </button>
            {/* Reset Plan -> reseeds the grid from its source (existing plan or recommendation) */}
            <button onClick={() => setGrid(seed())} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-sm">restart_alt</span> Reset Plan
            </button>
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="px-6 py-4 border-b border-outline-variant/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
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
            <p className="text-sm font-bold text-on-surface mt-0.5">{student?.grade_level?.level_name ?? student?.grade_level ?? "—"}</p>
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
            {!hideBackToRecommendation && (
              <button onClick={onBack} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60">
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Back to Recommendation
              </button>
            )}
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
