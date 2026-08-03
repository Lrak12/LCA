import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import {
  fetchReturningStudents,
  fetchLastCompletedPaces,
  assignStudentPace,
} from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// Canonical subjects — must match backend PACE_SUBJECT_ORDER / monitoring grid.
const SUBJECT_LABELS = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];
// Shorter column headers (display only)
const SUBJECT_HEAD = {
  "English": "English",
  "Mathematics": "Mathematics",
  "Science": "Science",
  "Word Building": "Word Building",
  "Filipino": "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika": "Sibika at Kultura / Heograpiya, Kasaysayan at Sibika",
  "Literature and Creative Writing": "Literature and Creative Writing",
};

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatDob = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const emptyMap = () => Object.fromEntries(SUBJECT_LABELS.map((l) => [l, ""]));

export default function ReturningStudentPlacement() {
  const schoolYearLabel = useSchoolYear();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [selId,    setSelId]    = useState(null);

  const [basis,     setBasis]     = useState(emptyMap);   // last completed PACE per subject (editable)
  const [basisLoad, setBasisLoad] = useState(false);
  const [decision,  setDecision]  = useState("accept");   // "accept" | "modify"
  const [overrides, setOverrides] = useState(emptyMap);   // modify values per subject

  const [generating, setGenerating] = useState(false);
  const [genError,    setGenError]   = useState("");
  const [okMsg,       setOkMsg]      = useState("");

  // Recommendation = last completed + 1 per subject
  const recommendation = useMemo(() => {
    const r = {};
    SUBJECT_LABELS.forEach((l) => {
      const n = Number(basis[l]);
      r[l] = n > 0 ? n + 1 : "";
    });
    return r;
  }, [basis]);

  // Load returning students
  useEffect(() => {
    setLoading(true);
    fetchReturningStudents()
      .then((res) => {
        const list = res.data?.students ?? [];
        setStudents(list);
        if (list.length) setSelId(list[0].student_id);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  // Load basis (last completed PACEs) when the selected student changes
  const loadBasis = useCallback((studentId) => {
    if (!studentId) return;
    setBasisLoad(true);
    setOkMsg("");
    setGenError("");
    fetchLastCompletedPaces(studentId)
      .then((res) => {
        const last = res.data ?? {};
        setBasis(Object.fromEntries(SUBJECT_LABELS.map((l) => [l, last[l] != null ? String(last[l]) : ""])));
      })
      .catch(() => setBasis(emptyMap()))
      .finally(() => setBasisLoad(false));
  }, []);

  useEffect(() => { loadBasis(selId); }, [selId, loadBasis]);

  // When recommendation changes, default the modify overrides to it
  useEffect(() => {
    setOverrides(Object.fromEntries(SUBJECT_LABELS.map((l) => [l, recommendation[l] !== "" ? String(recommendation[l]) : ""])));
  }, [recommendation]);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.idNumber.includes(search.trim())
  );
  const selected = students.find((s) => s.student_id === selId) ?? null;

  const handleGenerate = async () => {
    if (!selId) return;
    const source = decision === "accept" ? recommendation : overrides;
    const paces = {};
    SUBJECT_LABELS.forEach((l) => {
      const n = Number(source[l]);
      if (n > 0) paces[l] = n;   // backend auto-projects 4 quarters of 3 from this start
    });
    if (!Object.keys(paces).length) {
      setGenError("No valid starting PACEs to generate. Enter a basis or recommendation first.");
      return;
    }
    setGenerating(true);
    setGenError("");
    try {
      await assignStudentPace(selId, paces);
      setOkMsg(`Projection generated for ${selected?.name ?? "student"}.`);
    } catch (err) {
      setGenError(err.response?.data?.message ?? err.message ?? "Failed to generate projection.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest mb-2">
          <button onClick={() => navigate("/teacher/pace")} className="text-on-surface-variant hover:text-primary transition-colors">PACE Monitoring</button>
          <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
          <span className="text-secondary">Returning Student PACE Placement</span>
        </nav>

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">RETURNING STUDENT PACE PLACEMENT</h2>
            <p className="text-on-surface-variant mt-1 max-w-xl">Review previous PACE records and generate a projected PACE recommendation for returning students.</p>
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

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1.5">Search Student</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
                <input type="text" placeholder="Search by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                {/* clear (×) -> empty the box */}
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
                    className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none">close</button>
                )}
              </div>
              {/* Results dropdown when searching */}
              {search && (
                <div className="mt-2 max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-on-surface-variant">No returning students match.</p>
                  ) : filtered.map((s) => (
                    <button key={s.student_id} onClick={() => { setSelId(s.student_id); setSearch(""); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container-low transition-colors ${s.student_id === selId ? "bg-primary/5 font-bold" : ""}`}>
                      {s.name} <span className="text-on-surface-variant">· ID {s.idNumber} · {s.gradeLevel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:w-56">
              <label className="block text-xs font-bold text-on-surface-variant mb-1.5">School Year</label>
              <input type="text" value={schoolYearLabel ?? selected?.schoolYear ?? ""} readOnly
                className="w-full px-4 py-2.5 text-sm font-bold bg-gray-50 border border-outline-variant/30 rounded-xl text-on-surface" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : !students.length ? (
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3 block" style={fillStyle}>history_edu</span>
            <p className="text-base font-bold text-on-surface">No returning students</p>
            <p className="text-sm text-on-surface-variant mt-1">Students appear here once they have completed PACE history.</p>
          </div>
        ) : selected && (
          <>
            {okMsg && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-green-50 border border-green-100 text-green-700 text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{okMsg}</span>
                <button onClick={() => navigate("/teacher/pace")} className="font-bold underline hover:no-underline">Back to PACE Monitoring</button>
              </div>
            )}

            {/* Student demographic card */}
            <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 flex-1">
                  <Info label="Student Name & ID" value={<>{selected.name}<br /><span className="text-on-surface-variant font-normal">{selected.idNumber}</span></>} />
                  <Info label="Date of Birth" value={formatDob(selected.dateOfBirth)} />
                  <Info label="Age" value={selected.age ?? "—"} />
                  <Info label="Gender" value={selected.gender} />
                  <Info label="Grade Level" value={selected.gradeLevel} />
                  <Info label="School Year" value={selected.schoolYear} />
                  <Info label="Status" value={<span className="inline-block bg-green-100 text-green-700 text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full">{selected.status}</span>} />
                </div>
                <button
                  title="Editing student info is coming soon"
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50 transition-colors shrink-0"
                  onClick={() => {}}
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                  Edit Info
                </button>
              </div>
            </div>

            {/* Basis table */}
            <SubjectTable
              title="Basis for New Projected PACE"
              caption={`These are the last completed PACEs per subject and will be used as basis for generating the new projection.`}
              rowLabel="Last Completed PACE"
              loading={basisLoad}
              render={(label) => (
                <input type="number" min="1001" max="9999" value={basis[label]}
                  onChange={(e) => setBasis((p) => ({ ...p, [label]: e.target.value }))}
                  placeholder="—"
                  className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
              )}
            />

            {/* Recommendation table */}
            <SubjectTable
              title="System Generated Recommendation"
              caption="Recommended starting PACEs for each subject."
              rowLabel="Recommended Starting PACE"
              render={(label) => (
                <span className="inline-block w-20 text-center bg-gray-100 text-on-surface rounded-lg px-2 py-1.5 text-sm font-bold">
                  {recommendation[label] !== "" ? recommendation[label] : "—"}
                </span>
              )}
            />

            {/* Supervisor decision */}
            <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary" style={fillStyle}>account_circle</span>
                <h3 className="text-sm font-extrabold text-on-surface">Supervisor Decision</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DecisionCard active={decision === "accept"} onClick={() => setDecision("accept")}
                  title="Accept Recommendation" desc="Use the system-generated recommended PACEs as the starting PACEs." />
                <DecisionCard active={decision === "modify"} onClick={() => setDecision("modify")}
                  title="Modify Recommendation" desc="Modify the recommended starting PACEs for each subject (within grade-level limits)." />
              </div>

              {decision === "modify" && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {SUBJECT_LABELS.map((label) => (
                    <div key={label}>
                      <label className="block text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1 leading-tight">{SUBJECT_HEAD[label]}</label>
                      <input type="number" min="1001" max="9999" value={overrides[label]}
                        onChange={(e) => setOverrides((p) => ({ ...p, [label]: e.target.value }))}
                        placeholder="—"
                        className="w-full text-center border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generate */}
            <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-on-surface uppercase tracking-wide">Generate New Projection <span className="text-on-surface-variant normal-case font-bold">(Year {selected.schoolYear})</span></h3>
                <p className="text-xs text-on-surface-variant mt-1">Click generate to create the next projected PACEs based on the last completed PACEs.</p>
                {genError && (
                  <p className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">error</span>{genError}
                  </p>
                )}
              </div>
              <button onClick={handleGenerate} disabled={generating || basisLoad}
                className="flex items-center gap-2 px-6 py-3 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
                {generating
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <span className="text-base">✦</span>}
                {generating ? "Generating…" : "Generate Projection"}
              </button>
            </div>
          </>
        )}
      </main>
    </TeacherLayout>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Info = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
    <p className="text-sm font-bold text-on-surface leading-snug">{value}</p>
  </div>
);

const DecisionCard = ({ active, onClick, title, desc }) => (
  <button onClick={onClick}
    className={`text-left rounded-xl border p-4 transition-colors ${active ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-gray-200 hover:bg-gray-50"}`}>
    <div className="flex items-start gap-2">
      <span className={`material-symbols-outlined text-lg ${active ? "text-primary" : "text-on-surface-variant"}`} style={active ? fillStyle : {}}>
        {active ? "radio_button_checked" : "radio_button_unchecked"}
      </span>
      <div>
        <p className="text-sm font-extrabold text-on-surface">{title}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
      </div>
    </div>
  </button>
);

function SubjectTable({ title, caption, rowLabel, render, loading }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-outline-variant/10">
        <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">{title}</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">{caption}</p>
      </div>
      <div className="overflow-x-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 gap-2 text-xs text-on-surface-variant">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />Loading…
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-lowest border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
              <th className="px-4 py-3 text-left min-w-[150px]"></th>
              {SUBJECT_LABELS.map((l) => (
                <th key={l} className="px-3 py-3 text-center leading-tight">{SUBJECT_HEAD[l]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-4 text-xs font-extrabold text-on-surface-variant border-r border-slate-100 whitespace-nowrap">{rowLabel}</td>
              {SUBJECT_LABELS.map((l) => (
                <td key={l} className="px-3 py-4 text-center">{render(l)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
