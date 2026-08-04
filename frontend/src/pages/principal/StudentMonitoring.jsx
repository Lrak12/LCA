// Principal Student Monitoring page. Tabs: Records / Progress / Recommendations /
// PACE Analytics. "View Details" opens StudentSummaryModal.
// Backend chain (frontend api/studentMonitoring.js -> routes/studentMonitoring.routes.js, mounted at /student-monitoring):
//   list+tabs: GET /student-monitoring               -> controllers/studentMonitoring.controller.js > getOverview (~line 7)        -> services/studentMonitoring.service.js > getStudentMonitoring (~line 167)
//   analytics: GET /student-monitoring/pace-analytics -> controllers/studentMonitoring.controller.js > getPaceAnalytics (~line 20)   -> services/studentMonitoring.service.js > getPaceAnalytics (~line 297)
//   summary:   GET /student-monitoring/:id/summary    -> controllers/studentMonitoring.controller.js > getStudentSummary (~line 26)  -> services/studentMonitoring.service.js > getStudentSummary (~line 452)
//   full plan: GET /student-monitoring/:id/profile    -> controllers/studentMonitoring.controller.js > getStudentProfile (~line 13)  -> services/studentMonitoring.service.js > getStudentProfile (~line 649)
import { useState, useEffect, useMemo, useRef } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import StudentSummaryModal from "../../components/StudentSummaryModal.jsx";
import ProjectedPacePlanModal from "./ProjectedPacePlanModal.jsx";
import { fetchStudentMonitoring, fetchPaceAnalytics, fetchStudentProfile, exportStudentRecords } from "../../api/studentMonitoring.js";
import { importStudentsCSV, createStudent } from "../../api/student.js";
import { fetchAllSections } from "../../api/sections.js";
import { isPhMobile, PH_MOBILE_HINT } from "../../utils/phone.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const PAGE_SIZE = 6;

const TABS = [
  { id: "records",       label: "Student Records"        },
  { id: "progress",      label: "Student Progress"       },
  { id: "recommendations", label: "Projected PACE Plan"   },
  // Hidden for panel view — tab content/handlers remain below, just no nav entry.
  // { id: "analytics",     label: "PACE Analytics & Rankings" },
];

// Render a student's name as "Last, First" (falls back to whatever parts exist).
const lastFirst = (s) => {
  const last  = (s.last_name  ?? "").trim();
  const first = (s.first_name ?? "").trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || s.full_name || "—";
};

// Compare two students by "last name, first name" for A→Z / Z→A sorting.
const compareByName = (a, b, dir) =>
  (`${a.last_name ?? ""} ${a.first_name ?? ""}`)
    .localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`, undefined, { sensitivity: "base" }) * dir;

// Derive a simple PACE status label from a student's pace counts
const paceStatusOf = (s) => {
  if (!s.totalPaces) return "Not Started";
  if (s.completedPaces >= s.totalPaces) return "Completed";
  return "In Progress";
};

const PaceStatusBadge = ({ status }) => {
  const styles = {
    "Completed":   "bg-green-100 text-green-700",
    "In Progress": "bg-amber-100 text-amber-700",
    "Not Started": "bg-surface-container-high text-on-surface-variant",
  };
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${styles[status] ?? styles["Not Started"]}`}>
      {status}
    </span>
  );
};

// ─── CSV Helpers (copied from the Students page) ──────────────────────────────
const REQUIRED_COLS = [
  "first_name", "last_name", "date_of_birth",
  "gender", "address", "contact_number", "enrollment_date", "grade_level",
];

const parseCSVLine = (line) => {
  const result = [];
  let current  = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
};

const parseCSV = (text) => {
  const lines   = text.replace(/\r/g, "").trim().split("\n");
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  return { headers, rows: lines.slice(1).filter(Boolean).map((line) => {
    const vals = parseCSVLine(line);
    return headers.reduce((obj, h, i) => { obj[h] = vals[i] ?? ""; return obj; }, {});
  })};
};

const downloadTemplate = () => {
  const sample = [
    "Juan", "dela Cruz", "2013-03-15",
    "Male", "Dumaguete City", "09201112233", "2025-06-10", "Grade 5",
  ];
  const content = REQUIRED_COLS.join(",") + "\n" + sample.join(",") + "\n";
  const blob = new Blob([content], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "student_import_template.csv"; a.click();
  URL.revokeObjectURL(url);
};
//update supervisor assign pace add start and end date

// ─── Import Modal (copied from the Students page) ─────────────────────────────
// CSV import: upload > preview > import > result. Parses client-side, then POSTs
// via importStudentsCSV (api/student.js).
// Rendered by <StudentMonitoring> (showImport). onClose = () => setShowImport(false);
// onSuccess = reload (refetches the monitoring dataset).
function ImportModal({ onClose, onSuccess }) {
  const [step,       setStep]       = useState("upload"); // upload | preview | importing | result
  const [rows,       setRows]       = useState([]);
  const [parseError, setParseError] = useState("");
  const [result,     setResult]     = useState(null);
  const [fileName,   setFileName]   = useState("");
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setParseError("Please select a .csv file."); return; }
    setFileName(file.name);
    setParseError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers, rows: parsed } = parseCSV(e.target.result);
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
        if (missing.length) {
          setParseError(`Missing required columns: ${missing.join(", ")}`);
          return;
        }
        if (parsed.length === 0) { setParseError("The CSV file has no data rows."); return; }
        setRows(parsed);
        setStep("preview");
      } catch {
        setParseError("Failed to parse the CSV file. Check the format and try again.");
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const confirmImport = async () => {
    setStep("importing");
    try {
      const payload = rows.map((r) =>
        REQUIRED_COLS.reduce((obj, col) => { obj[col] = r[col]; return obj; }, {})
      );
      const res = await importStudentsCSV(payload);
      setResult(res.data);
      onSuccess();
    } catch (err) {
      setResult({ imported: 0, failed: [{ name: "All rows", reason: err.message }] });
    }
    setStep("result");
  };

  const reset = () => { setStep("upload"); setRows([]); setParseError(""); setFileName(""); setResult(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-outline-variant/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg" style={fillStyle}>upload_file</span>
            </div>
            <div>
              <h2 className="font-headline text-lg font-extrabold text-primary">Import Students via CSV</h2>
              <p className="text-[11px] text-on-surface-variant">
                {step === "upload"    && "Upload a CSV file with student data"}
                {step === "preview"   && `${rows.length} row(s) ready to import — review before confirming`}
                {step === "importing" && "Importing students, please wait…"}
                {step === "result"    && "Import complete"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container-low transition-colors text-on-surface-variant">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-7 py-3 border-b border-outline-variant/10 shrink-0">
          {["Upload", "Preview", "Import", "Result"].map((label, i) => {
            const idx    = ["upload", "preview", "importing", "result"].indexOf(step);
            const active = i === idx;
            const done   = i < idx;
            return (
              <div key={label} className="flex items-center">
                <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                  active ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "text-on-surface-variant"
                }`}>
                  {done && <span className="material-symbols-outlined text-sm" style={fillStyle}>check_circle</span>}
                  {label}
                </div>
                {i < 3 && <span className="text-outline-variant mx-1">›</span>}
              </div>
            );
          })}
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 px-7 py-6">

          {/* ── Upload step ── */}
          {step === "upload" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-600 text-xl" style={fillStyle}>description</span>
                  <div>
                    <p className="text-sm font-bold text-blue-800">Need the correct format?</p>
                    <p className="text-[11px] text-blue-600">Download the template CSV with all required columns.</p>
                  </div>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="text-sm font-bold text-blue-700 border border-blue-300 rounded-lg px-4 py-2 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  Template
                </button>
              </div>

              <div>
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">Required columns</p>
                <div className="flex flex-wrap gap-2">
                  {REQUIRED_COLS.map((col) => (
                    <span key={col} className="text-[11px] font-bold bg-surface-container-low text-on-surface-variant px-2.5 py-1 rounded-md font-mono">
                      {col}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-on-surface-variant mt-2">
                  Login credentials are generated automatically — password is <span className="font-bold font-mono">date_of_birth</span> without dashes (e.g. <span className="font-mono">20120314</span>).
                  Use the exact grade level name from Settings (e.g. <span className="font-bold font-mono">Grade 5</span>).
                </p>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/40 rounded-2xl p-5 sm:p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-3xl" style={fillStyle}>upload_file</span>
                </div>
                <div className="text-center">
                  <p className="font-bold text-on-surface">
                    {fileName ? fileName : "Drag & drop your CSV here"}
                  </p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    or <span className="text-primary font-bold">browse files</span> — .csv only
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">
                  <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
                  {parseError}
                </div>
              )}
            </div>
          )}

          {/* ── Preview step ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-on-surface-variant">
                  Showing all <span className="font-bold text-on-surface">{rows.length}</span> row(s) from <span className="font-bold text-on-surface">{fileName}</span>
                </p>
                <button onClick={reset} className="text-sm font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">refresh</span>
                  Change file
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                      {REQUIRED_COLS.map((col) => (
                        <th key={col} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-4 py-3 text-left whitespace-nowrap">
                          {col.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                        {REQUIRED_COLS.map((col) => (
                          <td key={col} className="px-4 py-2.5 text-xs text-on-surface whitespace-nowrap max-w-[160px] truncate">
                            {row[col] || <span className="text-error">missing</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-800">
                <span className="material-symbols-outlined text-base shrink-0 mt-0.5" style={fillStyle}>info</span>
                <span>Each student's login password will be their <strong>date of birth without dashes</strong>. They can change it after first login.</span>
              </div>
            </div>
          )}

          {/* ── Importing step ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="text-center">
                <p className="font-bold text-on-surface text-lg">Importing {rows.length} student(s)…</p>
                <p className="text-sm text-on-surface-variant mt-1">This may take a moment. Please don't close this window.</p>
              </div>
            </div>
          )}

          {/* ── Result step ── */}
          {step === "result" && result && (
            <div className="space-y-5">
              <div className={`flex items-center gap-4 p-5 rounded-2xl ${result.imported > 0 ? "bg-green-50 border border-green-100" : "bg-error-container border border-error/20"}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${result.imported > 0 ? "bg-green-100" : "bg-error-container"}`}>
                  <span className={`material-symbols-outlined text-2xl ${result.imported > 0 ? "text-green-600" : "text-error"}`} style={fillStyle}>
                    {result.imported > 0 ? "check_circle" : "cancel"}
                  </span>
                </div>
                <div>
                  <p className={`font-extrabold text-lg ${result.imported > 0 ? "text-green-800" : "text-error"}`}>
                    {result.imported} student(s) imported successfully
                  </p>
                  {result.failed.length > 0 && (
                    <p className="text-sm text-on-surface-variant mt-0.5">{result.failed.length} row(s) failed — see details below</p>
                  )}
                </div>
              </div>

              {result.failed.length > 0 && (
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">Failed rows</p>
                  <div className="space-y-2">
                    {result.failed.map((f, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                        <span className="material-symbols-outlined text-error text-base shrink-0 mt-0.5">error</span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{f.name}</p>
                          <p className="text-xs text-on-surface-variant">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between px-7 py-5 border-t border-outline-variant/20 shrink-0">
          <button
            onClick={step === "result" ? reset : onClose}
            className="text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {step === "result" ? "Import another file" : "Cancel"}
          </button>
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <>
                <button
                  onClick={reset}
                  className="text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={confirmImport}
                  className="text-sm font-bold bg-primary text-white rounded-lg px-5 py-2 hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-base" style={fillStyle}>upload</span>
                  Confirm Import ({rows.length} students)
                </button>
              </>
            )}
            {step === "result" && (
              <button
                onClick={onClose}
                className="text-sm font-bold bg-primary text-white rounded-lg px-5 py-2 hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Student Progress tab ─────────────────────────────────────────────────────
const PROGRESS_PAGE_SIZE = 7;

// completion % from the backend-provided counts (guards divide-by-zero)
const completionPct = (s) => (s.totalPaces ? (s.completedPaces / s.totalPaces) * 100 : 0);

// turn that % into the status label used by the table + Status filter
const progressStatusOf = (s) => {
  if (!s.totalPaces) return "Needs Intervention";
  const p = completionPct(s);
  if (p >= 80) return "Completed";
  if (p >= 40) return "In Progress";
  return "Needs Intervention";
};

// coloured status pill
const ProgressStatusBadge = ({ status }) => {
  const styles = {
    "Completed":         "bg-green-100 text-green-700",
    "In Progress":       "bg-amber-100 text-amber-700",
    "Needs Intervention": "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${styles[status] ?? styles["Needs Intervention"]}`}>
      {status}
    </span>
  );
};

// Student Progress tab. No API of its own - it reads the `students` prop the parent loaded
// via fetchStudentMonitoring (GET /student-monitoring). The per-student progress fields it
// displays (counts, completion %, pace status) are computed BY THE BACKEND in
// services/studentMonitoring.service.js > getStudentMonitoring (~line 167): per student it
// pulls student_pace (findStudentPaces) + the latest pace_test_result score, then derives
// `counts` via getPaceCounts() and the badge via getStudentStatus(counts). This tab only
// filters (grade/status/search) and paginates those already-computed rows.
function StudentProgressTab({ students, loading }) {
  const [gradeLevel, setGradeLevel] = useState("");
  const [status,     setStatus]     = useState("");
  const [page,       setPage]       = useState(1);

  // gradeLevels - the distinct grade levels present in `students`, sorted by grade
  //   number, used to fill the Grade Level dropdown. Recomputed only when `students`
  //   changes (useMemo) so it isn't rebuilt on every keystroke/page change.
  const gradeLevels = useMemo(() => {
    const levels = [...new Set(students.map((s) => s.grade_level).filter(Boolean))]; // unique values, drop blanks
    return levels.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);  // pull the digits out of e.g. "Grade 5"
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      return numA - numB;                                // sort ascending by grade number
    });
  }, [students]);

  // filtered - `students` narrowed by the two dropdowns. Recomputed when the list
  //   or either filter changes.
  const filtered = useMemo(() => students.filter((s) => {
    const matchGrade  = !gradeLevel || s.grade_level === gradeLevel;      // keep if "All" OR grade matches
    const matchStatus = !status     || progressStatusOf(s) === status;    // keep if "All" OR status matches
    return matchGrade && matchStatus;                                     // row survives only if BOTH pass
  }), [students, gradeLevel, status]);

  // ── Pagination math (all rows are already in memory, so this is client-side) ──
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PROGRESS_PAGE_SIZE)); // at least 1 page
  const currentPage = Math.min(page, totalPages);                                   // clamp if the list shrank
  const startIndex  = (currentPage - 1) * PROGRESS_PAGE_SIZE;                        // index of first row on this page
  const pageRows    = filtered.slice(startIndex, startIndex + PROGRESS_PAGE_SIZE);   // up to 7 rows actually rendered

  // buildPages() - the page-number buttons to show, windowed to 5 around the current
  //   page so the pager stays a fixed width even with many pages.
  const buildPages = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1); // few pages: show them all
    if (currentPage <= 3) return [1, 2, 3, 4, 5];                                    // near the start
    if (currentPage >= totalPages - 2)
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]; // near the end
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2]; // sliding middle window
  };

  return (
    <>
      {/* Filter Row - the two dropdowns. Changing either calls its setter AND
          setPage(1) so you don't get stranded on an out-of-range page. */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Grade Level</span>
          <div className="relative">
            <select
              value={gradeLevel}
              onChange={(e) => { setGradeLevel(e.target.value); setPage(1); }}
              className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-9 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[140px]"
            >
              <option value="">All</option>
              {gradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">expand_more</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Status</span>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-9 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[140px]"
            >
              <option value="">All</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Needs Intervention">Needs Intervention</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">expand_more</span>
          </div>
        </div>
      </div>

      {/* Table - 7 columns (#, Student ID, Name, Completed PACE, Total Assigned,
          PACE Completion %, Status). The header cells are generated from this array. */}
      <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                {["#", "Student ID", "Name", "Completed PACE", "Total Assigned", "PACE Completion %", "Status"].map((h) => (
                  <th
                    key={h}
                    className={`text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-4 whitespace-nowrap ${
                      h === "Status" ? "text-center" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                Array.from({ length: PROGRESS_PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-5"><div className="animate-pulse bg-surface-container-high rounded h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-on-surface-variant">
                    {students.length === 0 ? "No students found." : "No students match the current filters."}
                  </td>
                </tr>
              ) : (
                pageRows.map((s, idx) => {
                  const pct = completionPct(s);
                  return (
                    <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-5 py-5 text-sm font-bold text-on-surface-variant">{startIndex + idx + 1}</td>
                      <td className="px-5 py-5 text-sm font-medium text-on-surface-variant whitespace-nowrap">ID {s.student_id}</td>
                      <td className="px-5 py-5 text-sm font-bold text-on-surface">{lastFirst(s)}</td>
                      <td className="px-5 py-5 text-sm text-on-surface">{s.completedPaces}</td>
                      <td className="px-5 py-5 text-sm text-on-surface">{s.totalPaces}</td>
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-on-surface w-16 shrink-0">{pct.toFixed(2)}%</span>
                          <div className="w-24 h-2 rounded-full bg-surface-container-high overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-center"><ProgressStatusBadge status={progressStatusOf(s)} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - left: "Showing X to Y of Z" summary (from startIndex,
            PROGRESS_PAGE_SIZE and filtered.length). Right: prev / numbered / next
            buttons; the numbers come from buildPages(), and prev/next clamp via the
            setPage() calls. */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/10">
          <p className="text-xs text-on-surface-variant">
            {loading
              ? "Loading…"
              : filtered.length === 0
                ? "No students"
                : `Showing ${startIndex + 1} to ${Math.min(startIndex + PROGRESS_PAGE_SIZE, filtered.length)} of ${filtered.length} students`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            {buildPages().map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                  currentPage === p ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Recommendations tab ──────────────────────────────────────────────────────
const REC_PAGE_SIZE = 5;

const RecStatusBadge = ({ status }) => {
  const styles = {
    "On Track":     "bg-green-100 text-green-700",
    "Needs Support": "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${styles[status] ?? styles["Needs Support"]}`}>
      {status}
    </span>
  );
};

// Recommendations tab. No API of its own - it filters the `students` prop that
// <StudentMonitoring> already loaded via fetchStudentMonitoring (GET /student-monitoring),
// showing only rows whose `recommendation` field is non-null.
//
// WHERE THE RECOMMENDATION IS BUILT (backend):
//   services/studentMonitoring.service.js > buildRecommendation (~line 60),
//   called from getStudentMonitoring (~line 215) [and reused by getStudentSummary (~line 485)].
//   Decision order (first match wins; returns null = student won't appear here):
//     1. PLACEMENT - diagnostic recorded learning_gaps -> recommend those exact PACEs (Needs Support)
//     2. PLACEMENT - diagnostic start_pace but not yet placed -> place at start_pace (Needs Support)
//     3. ADVANCE   - current PACE passed (score >= 90) -> next PACE (On Track)
//     4. REMEDIATE - current PACE failed (score < 90) -> retake current PACE (Needs Support)
//     5. CONTINUE  - current PACE in progress -> stay on it (Needs Support if stalled/backlogged)
//   Each rec = { mode, currentPaceLabel, projectedPaceLabel, basis, status }.
// onView(s) -> page's setSelectedStudent (opens StudentSummaryModal).
function RecommendationsTab({ students, loading, onView }) {
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () => students.filter((s) => s.recommendation),
    [students]
  );

  const stats = useMemo(() => ({
    withRecommendations: rows.length,
    onTrack:     rows.filter((s) => s.recommendation.status === "On Track").length,
    needsSupport: rows.filter((s) => s.recommendation.status === "Needs Support").length,
  }), [rows]);

  const totalPages  = Math.max(1, Math.ceil(rows.length / REC_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex  = (currentPage - 1) * REC_PAGE_SIZE;
  const pageRows    = rows.slice(startIndex, startIndex + REC_PAGE_SIZE);

  const buildPages = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2)
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const statCards = [
    { label: "With Recommendations", value: stats.withRecommendations, icon: "description",  iconBg: "bg-primary-fixed", iconColor: "text-primary"   },
    { label: "On Track",             value: stats.onTrack,             icon: "trending_up",  iconBg: "bg-green-100",     iconColor: "text-green-600" },
    { label: "Needs Support",        value: stats.needsSupport,        icon: "warning",      iconBg: "bg-rose-100",      iconColor: "text-rose-600"  },
  ];

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-6 border border-outline-variant/20 shadow-sm flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
              <span className="material-symbols-outlined" style={fillStyle}>{card.icon}</span>
            </div>
            <div>
              <p className="text-on-surface-variant uppercase tracking-widest font-bold text-[11px] mb-1">{card.label}</p>
              {loading
                ? <div className="animate-pulse bg-surface-container-high rounded h-9 w-16" />
                : <p className="text-4xl font-extrabold text-primary font-headline tracking-tighter">{card.value}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                {["#", "Student ID", "Name", "Current PACE Level", "Projected Recommendation", "Recommendation Basis", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className={`text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-4 whitespace-nowrap ${
                      h === "Status" || h === "Actions" ? "text-center" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                Array.from({ length: REC_PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-5 py-5"><div className="animate-pulse bg-surface-container-high rounded h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-on-surface-variant">
                    No students with Projected plan yet.
                  </td>
                </tr>
              ) : (
                pageRows.map((s, idx) => (
                  <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-5 py-5 text-sm font-bold text-on-surface-variant">{startIndex + idx + 1}</td>
                    <td className="px-5 py-5 text-sm font-medium text-on-surface-variant whitespace-nowrap">ID {s.student_id}</td>
                    <td className="px-5 py-5 text-sm font-bold text-on-surface">{lastFirst(s)}</td>
                    <td className="px-5 py-5 text-sm text-on-surface whitespace-nowrap">{s.recommendation.currentPaceLabel}</td>
                    <td className="px-5 py-5 text-sm text-on-surface min-w-[180px]">{s.recommendation.projectedPaceLabel}</td>
                    <td className="px-5 py-5 text-sm text-on-surface-variant">{s.recommendation.basis}</td>
                    <td className="px-5 py-5 text-center"><RecStatusBadge status={s.recommendation.status} /></td>
                    {/* View -> onView(s) = page's setSelectedStudent (opens the summary modal) */}
                    <td className="px-5 py-5 text-center">
                      <button
                        onClick={() => onView(s)}
                        title="View details"
                        className="inline-flex items-center gap-1.5 bg-white border border-outline-variant/30 text-on-surface text-xs font-bold px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/10">
          <p className="text-xs text-on-surface-variant">
            {loading
              ? "Loading…"
              : rows.length === 0
                ? "No students"
                : `Showing ${startIndex + 1} to ${Math.min(startIndex + REC_PAGE_SIZE, rows.length)} of ${rows.length} students`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>
            {buildPages().map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                  currentPage === p ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── PACE Analytics & Rankings tab ────────────────────────────────────────────

// Dual-line SVG chart: this month vs last month cumulative completion %.
const CompletionTrendChart = ({ trend }) => {
  const weeks     = trend?.weeks ?? [];
  const thisMonth = trend?.thisMonth ?? [];
  const lastMonth = trend?.lastMonth ?? [];
  const n = weeks.length;

  if (!n || (thisMonth.length === 0 && lastMonth.length === 0)) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-on-surface-variant">
        No completion data yet for this month.
      </div>
    );
  }

  const W = 600, H = 240, padL = 38, padR = 12, padT = 12, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const step  = n > 1 ? plotW / (n - 1) : plotW;
  const yFor  = (v) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const xFor  = (i) => padL + i * step;

  const toPath = (series) =>
    series.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`).join(" ");

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56 overflow-visible">
      {/* y gridlines + labels */}
      {gridLines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={yFor(g)} x2={W - padR} y2={yFor(g)} stroke="currentColor" strokeWidth="1" className="text-outline-variant/30" />
          <text x={padL - 8} y={yFor(g) + 3} textAnchor="end" fontSize="10" className="fill-on-surface-variant">{g}%</text>
        </g>
      ))}

      {/* last month — dashed grey */}
      <path d={toPath(lastMonth)} fill="none" stroke="rgb(148 163 184)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
      {/* this month — solid blue */}
      <path d={toPath(thisMonth)} fill="none" stroke="rgb(37 99 235)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {thisMonth.map((v, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(v)} r="3.5" fill="rgb(37 99 235)" />
      ))}

      {/* week labels */}
      {weeks.map((w, i) => (
        <text key={w} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize="10" className="fill-on-surface-variant font-bold uppercase tracking-widest">{w}</text>
      ))}
    </svg>
  );
};

// PACE Analytics & Rankings tab. Loads its OWN data (separate from the other tabs) via
// fetchPaceAnalytics -> GET /student-monitoring/pace-analytics.
//
// WHERE IT'S BUILT (backend): services/studentMonitoring.service.js > getPaceAnalytics
//   (~line 297) [controller getPaceAnalytics ~line 20]. What it does:
//   - Finds the active quarter from the school's academic config (so it matches Settings).
//   - `rankings`: per student, sums performance points over PACEs FINISHED this quarter,
//     sorted by points desc, then # On-Time. Points per PACE come from scoreFinishedPace
//     (~line 290) = student_pace.points_earned (10 On-Time / 7 Extended / 5 Late-passed / 0
//     not-passed), stamped at completion by the Assign/Manage Student PACE flow.
//   - `topCompletion`: Top-10 by completion % (completed / total PACEs whose start_date is
//     in the quarter).
//   - `trend`: this-month-vs-last-month weekly completion counts for the chart.
//   - `stats`: topPerformer, pacesFinished, avgPoints.
function PaceAnalyticsTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchPaceAnalytics();
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.message ?? err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const topCompletion = data?.topCompletion ?? [];
  const trend         = data?.trend ?? { weeks: [], thisMonth: [], lastMonth: [] };

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 by PACE completion */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6">
          <h3 className="font-bold text-on-surface">Top 10 Students by PACE Completion</h3>
          <p className="text-xs text-on-surface-variant mt-0.5 mb-5">
            {data?.quarterLabel ?? "This quarter"} · ranked by PACE speed points · bar shows % completed
          </p>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-surface-container-high rounded h-5 w-full" />
              ))}
            </div>
          ) : topCompletion.length === 0 ? (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              No students to rank yet. A student appears here once they have PACEs scheduled this quarter.
            </div>
          ) : (
            <ul className="space-y-4">
              {topCompletion.map((r, i) => (
                <li key={r.student_id} className="flex items-center gap-4">
                  <span className="w-5 shrink-0 text-sm font-bold text-on-surface-variant tabular-nums text-right">{i + 1}</span>
                  <span className="w-28 shrink-0 text-sm font-bold text-on-surface truncate" title={r.full_name}>{r.full_name}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-surface-container-high overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${r.completionPct}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-sm font-extrabold text-primary tabular-nums text-right">
                    {r.completionPct.toFixed(2)}%
                  </span>
                  <span
                    className="w-14 shrink-0 text-xs font-bold text-on-surface-variant tabular-nums text-right"
                    title={`${r.onTime} on-time (10), ${r.extended} extended (7), ${r.late} late (5/0)`}
                  >
                    {r.points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Completion performance trend */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <h3 className="font-bold text-on-surface">PACE Completion Performance Trend</h3>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="w-4 h-0.5 rounded-full bg-[rgb(37,99,235)]" /> This Month
              </span>
              <span className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="w-4 border-t-2 border-dashed border-[rgb(148,163,184)]" /> Last Month
              </span>
            </div>
          </div>

          {loading ? (
            <div className="animate-pulse bg-surface-container-high rounded-xl h-56 w-full" />
          ) : (
            <CompletionTrendChart trend={trend} />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Placeholder for unbuilt tabs ─────────────────────────────────────────────
const TabPlaceholder = ({ label }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 py-20 flex flex-col items-center justify-center text-center">
    <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
      <span className="material-symbols-outlined text-on-surface-variant text-3xl">construction</span>
    </div>
    <p className="font-bold text-on-surface">{label}</p>
    <p className="text-sm text-on-surface-variant mt-1">This section is coming soon.</p>
  </div>
);

// ─── Skeleton row ─────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="px-5 py-5">
        <div className="animate-pulse bg-surface-container-high rounded h-4 w-full" />
      </td>
    ))}
  </tr>
);

// ─── Add Student Modal ────────────────────────────────────────────────────────
const REL_OPTIONS = ["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Other"];

// Reusable labeled field
const Field = ({ label, required, hint, span = 1, children }) => (
  <div className={span === 3 ? "md:col-span-3" : span === 2 ? "md:col-span-2" : ""}>
    <label className="text-[11px] font-bold text-on-surface">
      {label} {required && <span className="text-error">*</span>}
    </label>
    <div className="mt-1.5">{children}</div>
    {hint && <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p>}
  </div>
);

// Add Student form (student + parent/guardian). fetchAllSections fills the grade
// dropdown; createStudent (api/student.js) saves with auto-generated login creds.
// Rendered by <StudentMonitoring> (showAdd). onClose = () => setShowAdd(false);
// onSuccess = reload (refetches the monitoring dataset after createStudent).
function AddStudentModal({ onClose, onSuccess }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    first_name: "", middle_name: "", last_name: "", gender: "",
    date_of_birth: "", gl_id: "", contact_number: "", enrollment_date: todayISO,
    address: "",
    p_first: "", p_last: "", relationship: "", p_contact: "", p_email: "",
    is_active: true,
  });
  const [levels, setLevels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    fetchAllSections()
      .then((res) => setLevels(res.data?.data ?? res.data ?? []))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const missingFields = () => {
    const required = [
      ["First Name", form.first_name.trim()],
      ["Last Name", form.last_name.trim()],
      ["Gender", form.gender],
      ["Birth Date", form.date_of_birth],
      ["Grade Level", form.gl_id],
      ["Enrollment Date", form.enrollment_date],
      ["Home Address", form.address.trim()],
      ["Parent/Guardian First Name", form.p_first.trim()],
      ["Parent/Guardian Last Name", form.p_last.trim()],
      ["Relationship to Student", form.relationship],
    ];
    return required.filter(([, v]) => !v).map(([label]) => label);
  };

  const handleSubmit = async () => {
    setError("");
    const missing = missingFields();
    if (missing.length) {
      setError(`Please fill the required field(s): ${missing.join(", ")}.`);
      return;
    }
    // Contact numbers are optional, but must be a valid PH mobile number when provided.
    if (form.contact_number.trim() && !isPhMobile(form.contact_number)) { setError(PH_MOBILE_HINT); return; }
    if (form.p_contact.trim() && !isPhMobile(form.p_contact)) { setError(PH_MOBILE_HINT); return; }
    setSaving(true);
    try {
      // Mirror the CSV-import credential convention: password = DOB digits,
      // username = first.last, email = first.last.<dob>@lca.edu.
      // Note: middle_name is collected but not stored (no column on student).
      const password = form.date_of_birth.replace(/\D/g, "");
      const base     = `${form.first_name}.${form.last_name}`.toLowerCase().trim().replace(/\s+/g, ".");
      await createStudent({
        email:           `${base}.${password}@lca.edu`,
        password,
        username:        base,
        first_name:      form.first_name.trim(),
        last_name:       form.last_name.trim(),
        gender:          form.gender,
        date_of_birth:   form.date_of_birth,
        enrollment_date: form.enrollment_date,
        contact_number:  form.contact_number.trim(),
        address:         form.address.trim(),
        gl_id:           Number(form.gl_id),
        is_active:       form.is_active,
        parent: {
          parent_name:             `${form.p_first.trim()} ${form.p_last.trim()}`.trim(),
          contact_number:          form.p_contact.trim(),
          email:                   form.p_email.trim() || null,
          relationship_to_student: form.relationship,
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to add student.");
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3.5 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-7 py-5 border-b border-outline-variant/20 flex items-start justify-between shrink-0">
          <div>
            <h3 className="font-headline text-xl font-extrabold text-on-surface">Add Student</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Enter the student information below. All fields marked with <span className="text-error">*</span> are required.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-6">
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
              {error}
            </div>
          )}

          {/* Student information */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-on-surface text-lg" style={fillStyle}>person</span>
              <h4 className="font-bold text-on-surface">Student Information</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Student ID" required hint="Student ID will be generated automatically.">
                <input disabled value="Auto-generated" className={`${inputClass} bg-surface-container-low text-on-surface-variant cursor-not-allowed`} />
              </Field>
              <Field label="First Name" required>
                <input className={inputClass} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="Enter first name" />
              </Field>
              <Field label="Middle Name">
                <input className={inputClass} value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} placeholder="Enter middle name (optional)" />
              </Field>

              <Field label="Last Name" required>
                <input className={inputClass} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Enter last name" />
              </Field>
              <Field label="Gender" required>
                <select className={inputClass} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </Field>
              <Field label="Birth Date" required>
                <input type="date" className={inputClass} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
              </Field>

              <Field label="Grade Level" required>
                <select className={inputClass} value={form.gl_id} onChange={(e) => set("gl_id", e.target.value)}>
                  <option value="">Select grade level</option>
                  {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Contact Number" hint="Optional — PH mobile number, e.g. 09171234567.">
                <input className={inputClass} value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} placeholder="Enter contact number" />
              </Field>
              <Field label="Enrollment Date" required>
                <input type="date" className={inputClass} value={form.enrollment_date} onChange={(e) => set("enrollment_date", e.target.value)} />
              </Field>

              <Field label="Home Address" required span={3} hint="House No., Street, Barangay, City/Municipality, Province">
                <textarea rows={2} className={`${inputClass} resize-none`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Enter complete home address" />
              </Field>
            </div>
          </div>

          {/* Parent / Guardian information */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-on-surface text-lg" style={fillStyle}>diversity_3</span>
              <h4 className="font-bold text-on-surface">Parent / Guardian Information</h4>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">Provide the parent or guardian details associated with this student.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Parent / Guardian First Name" required>
                <input className={inputClass} value={form.p_first} onChange={(e) => set("p_first", e.target.value)} placeholder="Enter first name" />
              </Field>
              <Field label="Parent / Guardian Last Name" required>
                <input className={inputClass} value={form.p_last} onChange={(e) => set("p_last", e.target.value)} placeholder="Enter last name" />
              </Field>
              <Field label="Relationship to Student" required>
                <select className={inputClass} value={form.relationship} onChange={(e) => set("relationship", e.target.value)}>
                  <option value="">Select relationship</option>
                  {REL_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>

              <Field label="Parent / Guardian Contact Number" hint="Optional — PH mobile number, e.g. 09171234567.">
                <input className={inputClass} value={form.p_contact} onChange={(e) => set("p_contact", e.target.value)} placeholder="Enter contact number" />
              </Field>
              <Field label="Parent / Guardian Email" span={2} hint="Optional: used for communication and notifications.">
                <input className={inputClass} value={form.p_email} onChange={(e) => set("p_email", e.target.value)} placeholder="Enter email address (optional)" />
              </Field>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-outline-variant/20 flex items-center justify-between gap-4 shrink-0">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => set("is_active", !form.is_active)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form.is_active ? "bg-primary" : "bg-outline-variant/50"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-5" : ""}`} />
            </button>
            <span>
              <span className="text-sm font-bold text-on-surface">Student is active</span>
              <span className="block text-[11px] text-on-surface-variant">Inactive students will not appear in active lists.</span>
            </span>
          </label>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">close</span>
              Cancel
            </button>
            {/* Add Student -> handleSubmit() (createStudent, then onSuccess = page's reload) */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors shadow-sm shadow-primary/20 flex items-center gap-2"
            >
              {saving
                ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
              Save Student
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// The page itself: tabs, tables, stat cards, filters, pagination. Loads the list
// via fetchStudentMonitoring() on mount (the Analytics tab fetches separately).
export default function StudentMonitoring() {
  const schoolYearLabel = useSchoolYear();

  const [students,        setStudents]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState("");
  const [activeTab,       setActiveTab]       = useState("records");
  const [search,          setSearch]          = useState("");
  const [gradeLevel,      setGradeLevel]      = useState("");
  const [status,          setStatus]          = useState("");
  const [nameSort,        setNameSort]        = useState("asc"); // "asc" | "desc": Name column A→Z / Z→A
  const [page,            setPage]            = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [planStudent,     setPlanStudent]     = useState(null);  // Projected PACE Plan tab: student whose editable plan modal is open
  const [planProjection,  setPlanProjection]  = useState(null);  // that student's saved projection (subjectPaces), for seeding the grid
  const [planLoading,     setPlanLoading]     = useState(false);
  const [showImport,      setShowImport]      = useState(false);
  const [showAdd,         setShowAdd]         = useState(false);
  const [reloadKey,       setReloadKey]       = useState(0);
  const [exporting,       setExporting]       = useState(false);

  // Trigger a refresh (e.g. after a CSV import) by bumping the reload key
  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchStudentMonitoring();
        setStudents(res.data?.students ?? []);
      } catch (err) {
        setError(err.response?.data?.message ?? err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reloadKey]);

  // When a student's Projected PACE Plan is opened, load their saved projection so the
  // editable grid is seeded with the real plan (not defaults).
  useEffect(() => {
    if (!planStudent) { setPlanProjection(null); return; }
    let cancelled = false;
    setPlanLoading(true);
    setPlanProjection(null);
    fetchStudentProfile(planStudent.student_id)
      .then((res) => { if (!cancelled) setPlanProjection(res.data?.subjectPaces ?? {}); })
      .catch(() => { if (!cancelled) setPlanProjection({}); }) // fall back to defaults on error
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [planStudent]);

  // Unique grade levels from real data for the filter dropdown
  const gradeLevels = useMemo(() => {
    const levels = [...new Set(students.map((s) => s.grade_level).filter(Boolean))];
    return levels.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      return numA - numB;
    });
  }, [students]);

  const filtered = useMemo(() => students.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (s.first_name ?? "").toLowerCase().includes(q) ||
      (s.last_name  ?? "").toLowerCase().includes(q) ||
      String(s.student_id).includes(q);
    const matchGradeLevel = !gradeLevel || s.grade_level === gradeLevel;
    const matchStatus     = !status     || paceStatusOf(s) === status;
    return matchSearch && matchGradeLevel && matchStatus;
  }), [students, search, gradeLevel, status]);

  // Sort the filtered rows by "last name, first name" (A→Z or Z→A).
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareByName(a, b, nameSort === "desc" ? -1 : 1)),
    [filtered, nameSort],
  );

  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const startIndex   = (currentPage - 1) * PAGE_SIZE;
  const pageStudents = sorted.slice(startIndex, startIndex + PAGE_SIZE);

  const buildPages = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2)
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const resetFilters = () => { setSearch(""); setGradeLevel(""); setStatus(""); setPage(1); };

  // Full-records export: backend returns { headers, rows } (profile + grades +
  // summaries for EVERY student); build the wide CSV client-side and download it.
  const handleExportRecords = async () => {
    setExporting(true);
    try {
      const res = await exportStudentRecords();
      const { headers = [], rows = [] } = res.data ?? {};
      const esc = (v) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const content = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
      const blob = new Blob([content], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `student_records_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={reload}
        />
      )}
      {showAdd && (
        <AddStudentModal
          onClose={() => setShowAdd(false)}
          onSuccess={reload}
        />
      )}

      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
              Student Monitoring
            </h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              View, track, and monitor student progress and PACE completion.
            </p>
          </div>
          {/* header actions: Export -> exportCSV(students); Import -> setShowImport (ImportModal).
              Add Student moved to Diagnostic Assessment > "Create New Student Assessment". */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleExportRecords}
              disabled={students.length === 0 || exporting}
              className="flex items-center gap-2 bg-white border border-outline-variant/30 text-on-surface font-bold text-sm px-5 py-3 rounded-xl hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <span className="material-symbols-outlined text-lg" style={fillStyle}>download</span>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-white border border-outline-variant/30 text-on-surface font-bold text-sm px-5 py-3 rounded-xl hover:bg-surface-container-low transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-lg" style={fillStyle}>upload_file</span>
              Import CSV
            </button>
          </div>
        </header>

        {/* ── Error banner ───────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        {/* tabs -> setActiveTab(id) switches Records / Progress / Recommendations / PACE Analytics */}
        <div className="border-b border-outline-variant/20 mb-6">
          <div className="flex items-center gap-6 overflow-x-auto">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative pb-3 text-sm font-bold whitespace-nowrap transition-colors ${
                    active ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                  {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ────────────────────────────────────────────── */}
        {activeTab === "progress" ? (
          <StudentProgressTab students={students} loading={loading} />
        ) : activeTab === "recommendations" ? (
          <RecommendationsTab students={students} loading={loading} onView={setPlanStudent} />
        ) : activeTab === "analytics" ? (
          <PaceAnalyticsTab />
        ) : activeTab !== "records" ? (
          <TabPlaceholder label={TABS.find((t) => t.id === activeTab)?.label} />
        ) : (
          <>
            {/* Search + Filter Row */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-on-surface-variant text-base">search</span>
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
                />
                {/* clear (×) -> empty the box + reset to page 1 */}
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setPage(1); }}
                    aria-label="Clear search"
                    className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none"
                  >close</button>
                )}
              </div>

              {/* Grade level filter */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Grade Level</span>
                <div className="relative">
                  <select
                    value={gradeLevel}
                    onChange={(e) => { setGradeLevel(e.target.value); setPage(1); }}
                    className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-9 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[110px]"
                  >
                    <option value="">All</option>
                    {gradeLevels.map((gl) => (
                      <option key={gl} value={gl}>{gl}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Status</span>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl pl-4 pr-9 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[110px]"
                  >
                    <option value="">All</option>
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Not Started">Not Started</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1 text-on-surface-variant text-base pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Reset -> resetFilters() clears the search/grade/status filters */}
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 text-sm font-bold text-on-surface-variant bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm hover:bg-surface-container-low transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
                Reset
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                      {["#", "Student ID", "Name", "Grade Level", "PACE Status", "Actions"].map((h) => (
                        <th
                          key={h}
                          className={`text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-4 whitespace-nowrap ${
                            h === "PACE Status" || h === "Actions" ? "text-center" : "text-left"
                          }`}
                        >
                          {h === "Name" ? (
                            // Clickable header: toggles A→Z / Z→A by last name, first name
                            <button
                              type="button"
                              onClick={() => setNameSort((d) => (d === "asc" ? "desc" : "asc"))}
                              className="inline-flex items-center gap-1 font-extrabold tracking-widest uppercase hover:text-primary transition-colors"
                              title="Sort by name"
                            >
                              {h}
                              <span className="material-symbols-outlined text-sm leading-none">
                                {nameSort === "asc" ? "arrow_upward" : "arrow_downward"}
                              </span>
                            </button>
                          ) : (
                            h
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {loading ? (
                      Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonRow key={i} />)
                    ) : pageStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-sm text-on-surface-variant">
                          {students.length === 0 ? "No students found." : "No students match the current filters."}
                        </td>
                      </tr>
                    ) : (
                      pageStudents.map((s, idx) => (
                        <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="px-5 py-5 text-sm font-bold text-on-surface-variant">{startIndex + idx + 1}</td>
                          <td className="px-5 py-5 text-sm font-medium text-on-surface-variant whitespace-nowrap">ID {s.student_id}</td>
                          <td className="px-5 py-5 text-sm font-bold text-on-surface">{lastFirst(s)}</td>
                          <td className="px-5 py-5 text-sm text-on-surface whitespace-nowrap">{s.grade_level ?? "—"}</td>
                          <td className="px-5 py-5 text-center"><PaceStatusBadge status={paceStatusOf(s)} /></td>
                          {/* View Details -> setSelectedStudent(s) opens <StudentSummaryModal> */}
                          <td className="px-5 py-5 text-center">
                            <button
                              onClick={() => setSelectedStudent(s)}
                              className="inline-flex items-center gap-1.5 bg-white border border-outline-variant/30 text-on-surface text-xs font-bold px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors whitespace-nowrap"
                            >
                              <span className="material-symbols-outlined text-sm">visibility</span>
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/10">
                <p className="text-xs text-on-surface-variant">
                  {loading
                    ? "Loading…"
                    : filtered.length === 0
                      ? "No students"
                      : `Showing ${startIndex + 1} to ${Math.min(startIndex + PAGE_SIZE, filtered.length)} of ${filtered.length} students`}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  {buildPages().map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                        currentPage === p ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {selectedStudent && (
        <StudentSummaryModal
          studentId={selectedStudent.student_id}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* Projected PACE Plan tab > View Details: editable plan grid seeded from the
          student's saved projection. Save persists via generateProjection, then reloads. */}
      {planStudent && !planLoading && planProjection && (
        <ProjectedPacePlanModal
          student={planStudent}
          studentId={planStudent.student_id}
          initialProjection={planProjection}
          hideBackToRecommendation
          schoolYearLabel={schoolYearLabel}
          onBack={() => setPlanStudent(null)}
          onCancel={() => setPlanStudent(null)}
          onSaved={() => { setPlanStudent(null); reload(); }}
        />
      )}
    </PrincipalLayout>
  );
}
