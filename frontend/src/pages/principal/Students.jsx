// Student Management (principal): list/search enrolled students, export to CSV, and
// bulk-import students from a CSV file.
// Backend chain (frontend api/student.js -> routes/student.routes.js):
//   list:   GET  /students        -> controllers/student.controller.js > getAll (~line 5)          -> services/student.service.js > getAllStudents (~line 95)
//   import: POST /students/import -> controllers/student.controller.js > importStudents (~line 108) -> services/student.service.js > importStudents (~line 1247)
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchAllStudents, importStudentsCSV } from "../../api/student.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// columns the import CSV must contain (also used to build the template + preview table)
const REQUIRED_COLS = [
  "first_name", "last_name", "date_of_birth",
  "gender", "address", "contact_number", "enrollment_date", "grade_level",
];

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// ─── CSV Helpers ──────────────────────────────────────────────────────────────
// split one CSV line into fields, respecting quoted values that contain commas
const parseCSVLine = (line) => {
  const result = [];
  let current  = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;                          // toggle in/out of a quoted field
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());                   // comma outside quotes = field break
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());                       // last field
  return result;
};

// parse full CSV text into { headers, rows[] } with each row keyed by header name
const parseCSV = (text) => {
  const lines   = text.replace(/\r/g, "").trim().split("\n");
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim()); // first line = headers
  return { headers, rows: lines.slice(1).filter(Boolean).map((line) => {
    const vals = parseCSVLine(line);
    return headers.reduce((obj, h, i) => { obj[h] = vals[i] ?? ""; return obj; }, {}); // header -> value
  })};
};

// build + download a sample CSV so users know the exact expected format
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

// "Mon D, YYYY" date for the table, or the raw string if unparseable
const formatDate = (raw) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// export the current student list to a CSV download (quotes values containing commas)
const exportCSV = (students) => {
  const headers = ["student_id", "first_name", "last_name", "gender", "date_of_birth", "address", "contact_number", "enrollment_date"];
  const rows = students.map((s) =>
    headers.map((h) => {
      const val = s[h] ?? "";
      return String(val).includes(",") ? `"${val}"` : val;
    }).join(",")
  );
  const content = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `students_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Import Modal ─────────────────────────────────────────────────────────────
// 4-step CSV import wizard: upload > preview rows > import > show result.
// Rendered by <Students> (showModal). onClose = () => setShowModal(false);
// onSuccess = loadStudents (refetches the table after a successful import).
function ImportModal({ onClose, onSuccess }) {
  const [step,       setStep]       = useState("upload"); // which wizard step is showing
  const [rows,       setRows]       = useState([]);       // parsed CSV rows awaiting import
  const [parseError, setParseError] = useState("");       // client-side parse/validation error
  const [result,     setResult]     = useState(null);     // backend import result { imported, failed[] }
  const [fileName,   setFileName]   = useState("");
  const fileRef = useRef();                               // hidden <input type=file> ref

  // read + validate the chosen file, then move to the preview step
  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setParseError("Please select a .csv file."); return; }
    setFileName(file.name);
    setParseError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers, rows: parsed } = parseCSV(e.target.result);
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c)); // required columns absent?
        if (missing.length) {
          setParseError(`Missing required columns: ${missing.join(", ")}`);
          return;
        }
        if (parsed.length === 0) { setParseError("The CSV file has no data rows."); return; }
        setRows(parsed);
        setStep("preview");                              // parsed OK -> preview
      } catch {
        setParseError("Failed to parse the CSV file. Check the format and try again.");
      }
    };
    reader.readAsText(file);
  };

  // drag-and-drop onto the drop zone
  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  // send the previewed rows to the backend and capture the result
  const confirmImport = async () => {
    setStep("importing");
    try {
      const payload = rows.map((r) =>                    // keep only the required columns per row
        REQUIRED_COLS.reduce((obj, col) => { obj[col] = r[col]; return obj; }, {})
      );
      const res = await importStudentsCSV(payload);      // POST import to the backend
      setResult(res.data);
      onSuccess();                                       // parent reloads the student list
    } catch (err) {
      setResult({ imported: 0, failed: [{ name: "All rows", reason: err.message }] }); // whole batch failed
    }
    setStep("result");
  };

  // start over from the upload step
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
              {/* Template download */}
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

              {/* Required columns */}
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

              {/* Drop zone: drop -> handleDrop(); click -> opens the hidden file input (both feed handleFile) */}
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
                {/* hidden file input: file picked -> handleFile() */}
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
              {/* Summary banner */}
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

              {/* Failed rows */}
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

        {/* Modal footer — buttons vary by step */}
        <div className="flex items-center justify-between px-7 py-5 border-t border-outline-variant/20 shrink-0">
          {/* left button: on result step -> reset() (start over); otherwise -> onClose */}
          <button
            onClick={step === "result" ? reset : onClose}
            className="text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {step === "result" ? "Import another file" : "Cancel"}
          </button>
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <>
                {/* Back -> reset() returns to upload step */}
                <button
                  onClick={reset}
                  className="text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors"
                >
                  Back
                </button>
                {/* Confirm Import -> confirmImport() (importStudentsCSV, then onSuccess) */}
                <button
                  onClick={confirmImport}
                  className="text-sm font-bold bg-primary text-white rounded-lg px-5 py-2 hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-base" style={fillStyle}>upload</span>
                  Confirm Import ({rows.length} students)
                </button>
              </>
            )}
            {/* Done -> onClose closes the wizard */}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Students() {
  const schoolYearLabel = useSchoolYear();
  const location        = useLocation();
  const navigate        = useNavigate();

  const [students, setStudents]     = useState([]);   // full student list from the API
  const [loading,  setLoading]      = useState(true);
  const [error,    setError]        = useState("");
  const [search,   setSearch]       = useState("");   // name/ID search box
  const [page,     setPage]         = useState(1);
  const [showModal, setShowModal]   = useState(false); // import wizard open?
  const PER_PAGE = 10;

  // Auto-open modal when ?action=import (e.g. arriving from a dashboard shortcut)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "import") {
      setShowModal(true);
      navigate("/admin/students", { replace: true });  // strip the query param so refresh doesn't reopen it
    }
  }, [location.search, navigate]);

  // fetch all students (called on mount and after a successful import)
  const loadStudents = () => {
    setLoading(true);
    fetchAllStudents()                                 // GET all students
      .then((res) => setStudents(res.data ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStudents(); }, []);

  // client-side filter by name or student ID
  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      String(s.student_id).includes(q)
    );
  });

  // paginate the filtered list
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // windowed page numbers with "..." gaps for the pager
  const buildPages = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, "...", totalPages];
    if (page >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", page - 1, page, page + 1, "...", totalPages];
  };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      {showModal && (
        <ImportModal
          onClose={() => setShowModal(false)}
          onSuccess={loadStudents}
        />
      )}

      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">Students</h2>
            <p className="text-on-surface-variant mt-1">Manage and import enrolled students.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Export CSV (download current list) + Import CSV (open the wizard) */}
            <button
              onClick={() => exportCSV(students)}
              disabled={students.length === 0}
              className="flex items-center gap-2 bg-white border border-outline-variant/30 text-on-surface font-bold text-sm px-5 py-3 rounded-xl hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <span className="material-symbols-outlined text-lg" style={fillStyle}>download</span>
              Export CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-primary text-white font-bold text-sm px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-lg" style={fillStyle}>upload_file</span>
              Import CSV
            </button>
          </div>
        </header>

        {/* ── Student Table ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">

          {/* Table toolbar */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-outline-variant/20 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">search</span>
              {/* search box -> setSearch + reset to page 1 (filters the loaded list client-side) */}
              <input
                type="text"
                placeholder="Search by name or ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <span className="text-sm text-on-surface-variant ml-auto">
              <span className="font-bold text-on-surface">{filtered.length}</span> student(s)
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                  {["#", "Name", "Gender", "Date of Birth", "Address", "Contact Number", "Enrollment Date"].map((h) => (
                    <th key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-on-surface-variant text-sm">
                      {search ? "No students match your search." : "No students yet. Import a CSV to get started."}
                    </td>
                  </tr>
                ) : (
                  // one row per student on the current page
                  paginated.map((s, idx) => (
                    <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-5 py-4 text-xs text-on-surface-variant font-mono">
                        {(page - 1) * PER_PAGE + idx + 1}   {/* running row number across pages */}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container font-bold text-xs flex items-center justify-center shrink-0">
                            {(s.first_name?.[0] ?? "") + (s.last_name?.[0] ?? "")}
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-on-surface">
                              {s.first_name} {s.last_name}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">ID: {s.student_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface">{s.gender ?? "—"}</td>
                      <td className="px-5 py-4 text-sm text-on-surface">{formatDate(s.date_of_birth)}</td>
                      <td className="px-5 py-4 text-sm text-on-surface max-w-[220px] truncate">{s.address ?? "—"}</td>
                      <td className="px-5 py-4 text-sm text-on-surface font-mono">{s.contact_number ?? "—"}</td>
                      <td className="px-5 py-4 text-sm text-on-surface">{formatDate(s.enrollment_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/20">
            <p className="text-sm text-on-surface-variant">
              {filtered.length === 0
                ? "No students"
                : `Showing ${Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–${Math.min(page * PER_PAGE, filtered.length)} of `}
              {filtered.length > 0 && <span className="font-bold text-on-surface">{filtered.length}</span>}
            </p>
            {/* pager -> setPage (client-side slice of the filtered list) */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {buildPages().map((p, i) =>
                p === "..." ? (
                  <span key={`el-${i}`} className="w-8 text-center text-sm text-on-surface-variant">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                      page === p ? "bg-primary text-white" : "text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </PrincipalLayout>
  );
}

