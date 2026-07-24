// Set a returning/transfer student's projected PACE plan. Search a student >
// auto-load their info + last-completed PACE per subject (the "basis") + any saved
// projection > edit the 4-quarter table > Save. Projection load:
// getStudentPaceProjection; save: reports.service.generatePaceProjection (/assign-pace).
//
// Backend chain (Supervisor: view projected PACE plan + assign PACEs):
//   student search     fetchTeacherStudents (api/teacher.js)     GET /teacher/students
//   load one student   parallel: GET /students/:id (profile)
//                                 fetchLastCompletedPaces        GET /teacher/last-completed-paces
//                                 fetchStudentPaceProjection     GET /teacher/pace-projection
//       -> controllers/teacher.controller.js > getPaceProjection (~line 38)
//       -> services/teacher.service.js > getStudentPaceProjection (~line 131)
//            reads the saved pace_quarterly_projection rows for the student
//   save the plan      client.post("/teacher/assign-pace", ...) POST /teacher/assign-pace
//       -> routes/teacher-portal.routes.js (requireRole "teacher")
//       -> controllers/reports.controller.js > assignPace
//       -> services/reports.service.js > generatePaceProjection (~line 615)
//            writes/updates the pace_quarterly_projection rows (the projected plan) in DB
import { useState, useEffect, useRef } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchTeacherStudents, fetchStudentPaceProjection, fetchLastCompletedPaces } from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import client from "../../api/client.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Subjects (must match backend PACE_SUBJECT_ORDER) ─────────────────────────
const SUBJECTS = [
  { label: "English",                                              diagKey: "English"                 },
  { label: "Mathematics",                                          diagKey: "Math Beginner"            },
  { label: "Science",                                              diagKey: "Social Studies / Science" },
  { label: "Word Building",                                        diagKey: null                       },
  { label: "Filipino",                                             diagKey: null                       },
  { label: "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",    diagKey: null                       },
  { label: "Literature and Creative Writing",                      diagKey: null                       },
];

const QUARTERS     = [1, 2, 3, 4];
const DEFAULT_PPQ  = 3; // default PACEs per quarter (3 — matches monitoring/scoring/grades)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate  = (raw) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const computeAge  = (dob) => {
  if (!dob) return "—";
  const b = new Date(dob); const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() - b.getMonth() < 0 || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
};
const todayLabel  = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const prevSyLabel = (sy) => {
  if (!sy || sy === "—") return "—";
  const parts = sy.replace(/\s/g, "").split("–");
  if (parts.length < 2) return sy;
  return `${Number(parts[0]) - 1}–${Number(parts[1]) - 1}`;
};
const emptyBasis  = () => Object.fromEntries(SUBJECTS.map((s) => [s.label, ""]));

// autoProject - from { subject: lastCompletedPace }, build a full plan:
//   Q1 starts at last+1, each quarter advances DEFAULT_PPQ (3) PACEs.
//   Shape: proj[subject][q] = { start, count }.
function autoProject(basis) {
  const proj = {};
  SUBJECTS.forEach(({ label }) => {
    const last = Number(basis[label]);
    if (!last || isNaN(last) || last <= 0) return;
    proj[label] = {};
    let cursor = last + 1;
    QUARTERS.forEach((q) => {
      proj[label][q] = { start: String(cursor), count: String(DEFAULT_PPQ) };
      cursor += DEFAULT_PPQ;
    });
  });
  return proj;
}

// Convert API rows → same structure: proj[subject][q] = { start, count }
function rowsToProjection(rows) {
  const proj = {};
  rows.forEach((r) => {
    if (!proj[r.subject]) proj[r.subject] = {};
    proj[r.subject][r.quarter] = { start: String(r.pace_start), count: String(r.pace_count) };
  });
  return proj;
}

// Compute end PACE for a cell
function endPace(start, count) {
  const s = Number(start);
  const c = Number(count);
  if (!s || !c || isNaN(s) || isNaN(c)) return "—";
  return s + c - 1;
}

const deepCopy = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

// Quarter row label
const QUARTER_NAMES = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

// ─── Quarter badge ────────────────────────────────────────────────────────────
const QLabel = ({ q }) => {
  const colors = ["bg-blue-600", "bg-purple-600", "bg-amber-500", "bg-green-600"];
  return (
    <span className={`inline-block text-white text-[10px] font-extrabold px-2 py-0.5 rounded ${colors[q - 1]}`}>
      Q{q}
    </span>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
// One big component: student search, demographic card, basis inputs, and the
// editable 4-quarter projection table + Save.
export default function AssignPace() {
  const schoolYearLabel = useSchoolYear();

  const [allStudents,  setAllStudents]  = useState([]);   // all of the teacher's students (search pool)
  const [student,      setStudent]      = useState(null);  // the selected student record
  const [loadingInfo,  setLoadingInfo]  = useState(false); // true while a student's data loads
  const [infoError,    setInfoError]    = useState("");

  // Student info edit
  const [editMode,     setEditMode]     = useState(false);
  const [editForm,     setEditForm]     = useState({});
  const [savingInfo,   setSavingInfo]   = useState(false);
  const [infoMsg,      setInfoMsg]      = useState("");

  // Basis inputs (last completed PACE per subject)
  const [basis,        setBasis]        = useState(emptyBasis);

  // 4-quarter projection table — null = not yet shown
  // proj[subjectLabel][quarter] = { start: string, count: string }
  const [projection,   setProjection]   = useState(null);
  const [projSnapshot, setProjSnapshot] = useState(null); // for Reset (discard edits)
  const [hasExisting,  setHasExisting]  = useState(false); // loaded from DB
  // Quarters with recorded official PACE test scores — read-only in the table
  const [lockedQuarters, setLockedQuarters] = useState([]);

  // Save state
  const [saving,       setSaving]       = useState(false);
  const [saveSuccess,  setSaveSuccess]  = useState("");
  const [saveError,    setSaveError]    = useState("");

  // Search dropdown
  const [search,       setSearch]       = useState("");
  const [showDrop,     setShowDrop]     = useState(false);
  const searchRef = useRef(null);

  // Load teacher's students
  useEffect(() => {
    fetchTeacherStudents()
      .then((res) => setAllStudents(res.data ?? []))
      .catch(() => {});
  }, []);

  // Click-away for search dropdown
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // filtered - search-dropdown matches (name or ID); empty search shows nothing.
  const filtered = allStudents.filter((s) => {
    if (!search.trim()) return false;
    const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase()) || String(s.student_id).includes(search);
  });

  // ── Select a student ─────────────────────────────────────────────────────
  // selectStudent - reset state for the new student, then load 3 things in parallel:
  //   the student record, last-completed PACEs (the basis), and any saved projection.
  //   If a projection exists, show it; otherwise the basis seeds "Generate".
  const selectStudent = async (s) => {
    setSearch("");
    setShowDrop(false);
    setStudent(null);
    setBasis(emptyBasis());
    setProjection(null);
    setProjSnapshot(null);
    setHasExisting(false);
    setLockedQuarters([]);
    setEditMode(false);
    setInfoMsg("");
    setSaveSuccess("");
    setSaveError("");
    setLoadingInfo(true);
    setInfoError("");

    try {
      const [stuRes, completedRes, projRes] = await Promise.all([
        client.get(`/students/${s.student_id}`),
        fetchLastCompletedPaces(s.student_id),
        fetchStudentPaceProjection(s.student_id),
      ]);

      const stu = stuRes.data;
      setStudent(stu);
      setEditForm({
        first_name:    stu.first_name    ?? "",
        last_name:     stu.last_name     ?? "",
        date_of_birth: stu.date_of_birth ?? "",
        gender:        stu.gender        ?? "",
      });

      // Pre-fill basis with the student's last completed PACE per subject (the
      // PACEs they finished before transferring). Blank when no record exists.
      const initBasis = emptyBasis();
      Object.entries(completedRes.data ?? {}).forEach(([subject, lastNum]) => {
        if (SUBJECTS.some((sub) => sub.label === subject) && lastNum) {
          initBasis[subject] = String(lastNum);
        }
      });
      setBasis(initBasis);

      // Load existing projection if available (response: { rows, lockedQuarters })
      const projData     = projRes.data ?? {};
      const existingRows = Array.isArray(projData) ? projData : projData.rows ?? [];
      setLockedQuarters(Array.isArray(projData) ? [] : projData.lockedQuarters ?? []);
      if (existingRows.length > 0) {
        const proj = rowsToProjection(existingRows);
        setProjection(proj);
        setProjSnapshot(deepCopy(proj));
        setHasExisting(true);
      }
    } catch (err) {
      setInfoError(err.response?.data?.message ?? err.message);
    } finally {
      setLoadingInfo(false);
    }
  };

  // ── Save student info ─────────────────────────────────────────────────────
  const handleSaveInfo = async () => {
    if (!student) return;
    setSavingInfo(true);
    setInfoMsg("");
    try {
      await client.patch(`/students/${student.student_id}`, editForm);
      setStudent((prev) => ({ ...prev, ...editForm }));
      setEditMode(false);
      setInfoMsg("Student information updated.");
      setTimeout(() => setInfoMsg(""), 3000);
    } catch (err) {
      setInfoMsg(err.response?.data?.message ?? err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Auto-generate projection from basis ───────────────────────────────────
  const handleGenerate = () => {
    const proj = autoProject(basis);
    if (!Object.keys(proj).length) {
      setSaveError("Enter at least one last completed PACE number to generate the projection.");
      return;
    }
    setSaveError("");
    setProjection(proj);
    setProjSnapshot(deepCopy(proj));
    setHasExisting(false);
  };

  // ── Update a single projection cell ──────────────────────────────────────
  const updateCell = (subject, quarter, field, value) => {
    setProjection((prev) => ({
      ...prev,
      [subject]: {
        ...(prev[subject] ?? {}),
        [quarter]: {
          ...((prev[subject] ?? {})[quarter] ?? { start: "", count: String(DEFAULT_PPQ) }),
          [field]: value,
        },
      },
    }));
  };

  // Edit one PACE slot — contiguous/start-driven: setting slot i to v makes the
  // quarter's start = v - i, so the 3 PACEs stay sequential (1008, 1009, 1010).
  const updatePaceSlot = (subject, quarter, slotIndex, value) => {
    const num = Number(value);
    if (!value || isNaN(num)) return;
    updateCell(subject, quarter, "start", String(num - slotIndex));
  };

  // ── Reset manual edits back to the freshly generated / last-loaded plan ───
  const handleReset = () => {
    if (projSnapshot) setProjection(deepCopy(projSnapshot));
    setSaveError("");
    setSaveSuccess("");
  };

  // ── Save full projection to backend ──────────────────────────────────────
  // handleSaveProjection - build the { subject: { quarter: {start,count} } } payload
  //   (skipping locked quarters), POST it to /assign-pace, and show a success note.
  const handleSaveProjection = async () => {
    if (!student || !projection) return;
    setSaving(true);
    setSaveSuccess("");
    setSaveError("");

    try {
      // Build payload: { subject: { "1": { start, count }, ... } }
      const pacesPayload = {};
      SUBJECTS.forEach(({ label }) => {
        const subProj = projection[label];
        if (!subProj) return;
        const qMap = {};
        QUARTERS.forEach((q) => {
          if (lockedQuarters.includes(q)) return; // locked quarters are never re-sent
          const cell = subProj[q];
          if (cell && cell.start && Number(cell.start) > 0) {
            qMap[String(q)] = { start: Number(cell.start), count: Number(cell.count) || DEFAULT_PPQ };
          }
        });
        if (Object.keys(qMap).length) pacesPayload[label] = qMap;
      });

      if (!Object.keys(pacesPayload).length) {
        setSaveError("No valid PACE data to save.");
        setSaving(false);
        return;
      }

      await client.post("/teacher/assign-pace", {
        student_id: student.student_id,
        paces:      pacesPayload,
      });

      const subjectCount = Object.keys(pacesPayload).length;
      setSaveSuccess(
        `Projection saved for ${displayName} — ${subjectCount} subject${subjectCount > 1 ? "s" : ""} × 4 quarters (${schoolYearLabel})`
      );
      setHasExisting(true);
      setTimeout(() => setSaveSuccess(""), 8000);
    } catch (err) {
      setSaveError(err.response?.data?.message ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField   = (key, val) => setEditForm((f) => ({ ...f, [key]: val }));
  const setBasisFn = (label, val) => setBasis((b) => ({ ...b, [label]: val }));

  const displayName = student
    ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()
    : "—";
  const gradeName = student?.grade_level?.level_name ?? "—";

  const inputCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white w-full";

  // Subjects that have at least one quarter in the projection
  const activeSubjects = projection
    ? SUBJECTS.filter(({ label }) => projection[label] && Object.keys(projection[label]).length > 0)
    : [];

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 w-full max-w-full">

        {/* ── Page Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#0d1b2e] font-headline uppercase">
              Assign Pace
            </h1>
            <p className="text-sm text-on-surface-variant mt-1 max-w-lg">
              Assign projected PACEs for returning students for the current school year.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{todayLabel()}</span>
          </div>
        </div>

        {/* ── Search + School Year ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 flex gap-5 items-end">
          <div className="flex-1" ref={searchRef}>
            <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">
              Search Student
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-base">search</span>
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDrop(true); }}
                onFocus={() => search && setShowDrop(true)}
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
              />
              {showDrop && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto">
                  {filtered.slice(0, 8).map((s) => (
                    <button
                      key={s.student_id}
                      onClick={() => selectStudent(s)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary-fixed text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {s.first_name?.[0] ?? "?"}
                      </div>
                      <span className="text-sm font-medium text-on-surface">{s.last_name}, {s.first_name}</span>
                      <span className="ml-auto text-xs text-on-surface-variant">#{s.student_id}</span>
                    </button>
                  ))}
                </div>
              )}
              {showDrop && search.trim() && filtered.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 px-4 py-3 text-sm text-on-surface-variant">
                  No students found.
                </div>
              )}
            </div>
          </div>
          <div className="w-48">
            <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">
              School Year
            </label>
            <input
              readOnly
              value={schoolYearLabel !== "—" ? schoolYearLabel : ""}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-surface-container-low text-on-surface-variant cursor-default"
            />
          </div>
        </div>

        {/* ── Info / error messages ─────────────────────────────────── */}
        {infoError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {infoError}
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────── */}
        {loadingInfo && (
          <div className="space-y-4 animate-pulse">
            {[130, 200, 100].map((h, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm" style={{ height: h }} />
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {!loadingInfo && !student && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-14 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-2xl" style={fillStyle}>person_search</span>
            </div>
            <p className="text-sm font-bold text-on-surface">Search for a student to begin</p>
            <p className="text-xs text-on-surface-variant max-w-xs">
              Type a student name or ID in the search bar above to load their PACE information.
            </p>
          </div>
        )}

        {/* ── Student content ──────────────────────────────────────── */}
        {!loadingInfo && student && (
          <>
            {/* ── Student Info Card ──────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 flex-1">
                  <div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Student ID</p>
                    <p className="text-base font-extrabold text-[#0d1b2e]">{displayName}</p>
                    <p className="text-xs text-on-surface-variant">Stud-ID #{student.student_id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Date of Birth</p>
                    {editMode ? (
                      <input type="date" value={editForm.date_of_birth} onChange={(e) => setField("date_of_birth", e.target.value)} className={inputCls} />
                    ) : (
                      <p className="text-sm font-bold text-on-surface">{formatDate(student.date_of_birth)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Age</p>
                    <p className="text-sm font-bold text-on-surface">{computeAge(student.date_of_birth)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Gender</p>
                    {editMode ? (
                      <select value={editForm.gender} onChange={(e) => setField("gender", e.target.value)} className={inputCls}>
                        <option value="">Select</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    ) : (
                      <p className="text-sm font-bold text-on-surface">{student.gender || "—"}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {editMode ? (
                    <>
                      <button onClick={() => setEditMode(false)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50">
                        <span className="material-symbols-outlined text-sm">close</span>Cancel
                      </button>
                      <button onClick={handleSaveInfo} disabled={savingInfo} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-60">
                        {savingInfo ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-sm" style={fillStyle}>save</span>}
                        Save
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg border border-gray-200 text-on-surface hover:bg-gray-50">
                      <span className="material-symbols-outlined text-sm">edit</span>Edit Info
                    </button>
                  )}
                </div>
              </div>

              {infoMsg && (
                <p className="mt-3 text-xs text-green-600 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm" style={fillStyle}>check_circle</span>
                  {infoMsg}
                </p>
              )}

              <div className="border-t border-gray-100 my-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Head Level / Grade</p>
                  <p className="text-sm font-bold text-on-surface">{gradeName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">School Year</p>
                  <p className="text-sm font-bold text-on-surface">{schoolYearLabel !== "—" ? schoolYearLabel : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Status</p>
                  {/* Derived from student.source: 'imported' = enrolled before (returnee),
                      'diagnostic' = new student placed via Diagnostic Assessment */}
                  {student.source === "imported" ? (
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">Returnee</span>
                  ) : student.source === "diagnostic" ? (
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">New Student</span>
                  ) : (
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Non-returnee notice (warn but allow) ─────────────── */}
            {student.source !== "imported" && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5 shrink-0" style={fillStyle}>warning</span>
                <p>
                  <strong>Assign Pace is intended for returning students.</strong>{" "}
                  {displayName} was placed through the Diagnostic Assessment — their starting PACEs
                  normally come from that placement. You can still proceed if needed.
                </p>
              </div>
            )}

            {/* ── Basis Input ─────────────────────────────────────── */}
            {!projection && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
                <div className="mb-4">
                  <h2 className="text-sm font-extrabold text-[#0d1b2e] uppercase tracking-wide">
                    Basis for New Projected Pace{" "}
                    <span className="font-normal normal-case tracking-normal text-on-surface-variant text-xs">
                      (Previous School Year {prevSyLabel(schoolYearLabel)})
                    </span>
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    The PACEs this student finished before transferring — auto-filled from their records where available.
                    Edit any subject (or fill blanks from the student's transfer documents), then generate the new projection.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <td className="px-4 py-3 border border-gray-200 w-36 bg-white" />
                        {SUBJECTS.map((s) => (
                          <th key={s.label} className="px-3 py-3 text-xs font-bold text-on-surface text-center border border-gray-200 min-w-[110px] leading-snug">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-4 py-4 text-xs font-bold text-on-surface-variant border border-gray-200 whitespace-nowrap">
                          Last Completed PACE
                        </td>
                        {SUBJECTS.map((s) => (
                          <td key={s.label} className="px-3 py-3 text-center border border-gray-200">
                            <input
                              type="number"
                              min="1001"
                              max="9999"
                              value={basis[s.label]}
                              onChange={(e) => setBasisFn(s.label, e.target.value)}
                              placeholder="—"
                              className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {saveError && (
                  <p className="mt-3 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {saveError}
                  </p>
                )}
              </div>
            )}

            {/* ── Generate New Projection ─────────────────────────── */}
            {!projection && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-extrabold text-[#0d1b2e] uppercase tracking-wide">
                    Generate New Projection{" "}
                    <span className="font-normal normal-case tracking-normal text-on-surface-variant text-xs">
                      (Year {schoolYearLabel !== "—" ? schoolYearLabel : "—"})
                    </span>
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Click generate to create the next projected PACEs based on the last completed PACEs.
                  </p>
                </div>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 px-6 py-3 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shrink-0"
                >
                  <span className="text-base">✦</span>
                  Generate Projection
                </button>
              </div>
            )}

            {/* ── Projection Table (editable, transposed: quarters × subjects) ── */}
            {projection && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">

                {/* Header */}
                <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0d1b2e] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-white text-lg" style={fillStyle}>assignment</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-extrabold text-[#0d1b2e] uppercase tracking-tight font-headline">
                        Projected PACE
                      </h2>
                      <span className="text-sm font-medium text-on-surface-variant">
                        (School Year {schoolYearLabel !== "—" ? schoolYearLabel : "—"})
                      </span>
                      {hasExisting && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">
                          Saved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">restart_alt</span>
                      Reset
                    </button>
                    <button
                      onClick={() => { setProjection(null); setSaveError(""); setSaveSuccess(""); }}
                      title="Close — back to basis"
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 980 }}>
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left font-bold text-on-surface-variant tracking-wide border-r border-gray-200 w-32">
                          Quarter
                        </th>
                        {SUBJECTS.map((s) => (
                          <th key={s.label} className="px-3 py-3 text-center font-bold text-on-surface border-r border-gray-200 last:border-r-0 min-w-[110px] leading-snug">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {QUARTERS.map((q) => {
                        const isLocked = lockedQuarters.includes(q);
                        return (
                          <tr key={q} className={`border-b border-gray-200 last:border-b-0 ${isLocked ? "bg-amber-50/40" : ""}`}>
                            {/* Quarter label */}
                            <td className="px-4 py-4 border-r border-gray-200 align-middle font-bold text-on-surface whitespace-nowrap">
                              {QUARTER_NAMES[q - 1]}
                              {isLocked && (
                                <span className="mt-1 flex items-center gap-0.5 text-[9px] font-extrabold text-amber-600" title="Official PACE test scores recorded — this quarter can no longer be edited">
                                  <span className="material-symbols-outlined text-[12px]" style={fillStyle}>lock</span>
                                  Locked
                                </span>
                              )}
                            </td>
                            {/* Subject cells */}
                            {SUBJECTS.map(({ label }) => {
                              const cell  = projection[label]?.[q] ?? { start: "", count: String(DEFAULT_PPQ) };
                              const n     = Math.min(Math.max(Number(cell.count) || DEFAULT_PPQ, 1), 6);
                              const start = Number(cell.start);
                              return (
                                <td key={label} className="px-3 py-3 border-r border-gray-200 last:border-r-0 align-top">
                                  <div className="flex flex-col gap-1.5">
                                    {Array.from({ length: n }, (_, i) => {
                                      const val = cell.start && !isNaN(start) ? start + i : "";
                                      return (
                                        <input
                                          key={i}
                                          type="number"
                                          min="1001"
                                          max="9999"
                                          value={val}
                                          onChange={(e) => updatePaceSlot(label, q, i, e.target.value)}
                                          placeholder="—"
                                          disabled={isLocked}
                                          className="w-full text-center border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50"
                                        />
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    {saveSuccess ? (
                      <span className="text-green-600 font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm" style={fillStyle}>check_circle</span>
                        {saveSuccess}
                      </span>
                    ) : saveError ? (
                      <span className="text-red-600 font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {saveError}
                      </span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-blue-500 text-base" style={fillStyle}>info</span>
                        You can edit the projected PACEs manually. All changes will be saved for this student.
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => { setProjection(null); setSaveError(""); setSaveSuccess(""); }}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProjection}
                      disabled={saving || activeSubjects.length === 0}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                    >
                      {saving ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>
                      )}
                      {saving ? "Saving…" : "Save Projection"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </TeacherLayout>
  );
}
