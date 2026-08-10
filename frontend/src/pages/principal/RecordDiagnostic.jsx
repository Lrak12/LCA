// Record Diagnostic Assessment (principal): per-student hub with a card per subject; each
// card opens that subject's scoring modal, and once at least one result exists you can
// generate the projected PACE recommendation. Reached from DiagnosticAssessments.jsx "Record".
// Backend chain:
//   student's diagnostics: GET /assessments/diagnostic?student_id (api/diagnosticAssessments.js fetchDiagnostics)
//        -> controllers/assessment.controller.js > getDiagnostics (~line 43) -> services/assessment.service.js > getDiagnosticsByStudent (~line 20)
//   student record:        GET /students/:id -> controllers/student.controller.js > getById (~line 10) -> services/student.service.js > getStudentById (~line 101)
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchDiagnostics } from "../../api/diagnosticAssessments.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import client from "../../api/client.js";
import EnglishDiagnosticModal from "./EnglishDiagnosticModal.jsx";
import SocialScienceDiagnosticModal from "./SocialScienceDiagnosticModal.jsx";
import MathBeginnerDiagnosticModal from "./MathBeginnerDiagnosticModal.jsx";
import MathIntermediateDiagnosticModal from "./MathIntermediateDiagnosticModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Subject Definitions ──────────────────────────────────────────────────────
const SUBJECTS = [
  {
    key:         "math_beginner_score",
    label:       "Math Beginner",
    range:       "Grade 1 – 8",
    icon:        "calculate",
    description: "Assess basic numerical fluency, arithmetic operations, and initial conceptual understanding for primary level entry.",
  },
  {
    key:         "math_intermediate_score",
    label:       "Math Intermediate",
    range:       "Grade 8 – 10",
    icon:        "functions",
    description: "Evaluation of algebra readiness, geometry foundations, and word problem synthesis for middle-tier academic placement.",
  },
  {
    key:         "english_score",
    label:       "English",
    range:       "All Levels",
    icon:        "menu_book",
    description: "Comprehensive reading comprehension, vocabulary mastery, and grammatical structure analysis for core English placement.",
  },
  {
    key:         "social_studies_science_score",
    label:       "Social Studies / Science",
    range:       "All Levels",
    icon:        "travel_explore",
    description: "Assessment of historical context, geographical knowledge, civic understanding, and foundational scientific concepts across all levels.",
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RecordDiagnostic() {
  const { studentId } = useParams();
  const navigate      = useNavigate();
  const schoolYearLabel = useSchoolYear();

  const [student,      setStudent]      = useState(null);
  const [diagRows,     setDiagRows]     = useState([]); // all diagnostic rows for this student
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split("T")[0]); // display-only
  const [showEnglish,       setShowEnglish]       = useState(false); // which subject modal is open
  const [showMathBeginner,     setShowMathBeginner]     = useState(false);
  const [showMathIntermediate, setShowMathIntermediate] = useState(false);
  const [socialSciSubject,  setSocialSciSubject]  = useState(null); // "Social Studies" | "Science" | null

  // load the student + all their diagnostic rows; seed the date from the first recorded test
  const load = async () => {
    setLoading(true);
    try {
      const [stuRes, diagRes] = await Promise.all([
        client.get(`/students/${studentId}`),
        fetchDiagnostics(studentId),
      ]);
      setStudent(stuRes.data);
      const rows = diagRes.data ?? [];
      setDiagRows(rows);
      const recordedDate = rows.find((r) => r.test_date)?.test_date;
      if (recordedDate) setAssessmentDate(recordedDate.split("T")[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [studentId]);

  // find the recorded diagnostic row for a subject (undefined if not yet recorded)
  const getSubjectRow = (subjectLabel) =>
    diagRows.find((r) => r.subject === subjectLabel);

  const hasResults = diagRows.some((r) => r.start_pace != null); // enables the "Generate" button

  // open the matching subject modal for the clicked card
  const handleSubjectClick = (subject) => {
    if (subject.label === "English")                  { setShowEnglish(true);          return; }
    if (subject.label === "Math Beginner")            { setShowMathBeginner(true);     return; }
    if (subject.label === "Math Intermediate")        { setShowMathIntermediate(true); return; }
    if (subject.label === "Social Studies / Science") { setSocialSciSubject(subject.label); return; }
  };

  // each subject modal calls its handler on save: close it, then reload the rows
  const handleMathBegSaved = () => {
    setShowMathBeginner(false);
    load();
  };

  const handleMathIntSaved = () => {
    setShowMathIntermediate(false);
    load();
  };

  const handleEnglishSaved = () => {
    setShowEnglish(false);
    load();
  };

  const handleSocialSciSaved = () => {
    setSocialSciSubject(null);
    load();
  };

  return (
    <PrincipalLayout schoolYearLabel={loading ? "..." : schoolYearLabel}>
      {showEnglish && student && (
        <EnglishDiagnosticModal
          student={student}
          existing={getSubjectRow("English")}
          onClose={() => setShowEnglish(false)}
          onSaved={handleEnglishSaved}
        />
      )}
      {showMathBeginner && student && (
        <MathBeginnerDiagnosticModal
          student={student}
          existing={getSubjectRow("Math Beginner")}
          onClose={() => setShowMathBeginner(false)}
          onSaved={handleMathBegSaved}
        />
      )}
      {showMathIntermediate && student && (
        <MathIntermediateDiagnosticModal
          student={student}
          existing={getSubjectRow("Math Intermediate")}
          onClose={() => setShowMathIntermediate(false)}
          onSaved={handleMathIntSaved}
        />
      )}
      {socialSciSubject && student && (
        <SocialScienceDiagnosticModal
          subject={socialSciSubject}
          student={student}
          existing={getSubjectRow(socialSciSubject)}
          onClose={() => setSocialSciSubject(null)}
          onSaved={handleSocialSciSaved}
        />
      )}

      <main className="p-4 sm:p-8 w-full max-w-7xl">

        {/* Breadcrumb + Select Another Student */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <nav className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest flex-wrap">
            <button onClick={() => navigate("/admin/diagnostic")} className="text-on-surface-variant hover:text-primary transition-colors">
              Diagnostic Assessment Management
            </button>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
            <span className="text-secondary">Record Diagnostic Assessment</span>
          </nav>
          <button
            onClick={() => navigate("/admin/diagnostic")}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Select Another Student
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Page Header */}
        <header className="mb-8">
          <h2 className="text-3xl font-extrabold text-primary font-headline tracking-tight">
            Record Diagnostic Assessment
          </h2>
          <p className="text-on-surface-variant text-sm mt-1 leading-relaxed max-w-2xl">
            Enter and manage diagnostic assessment results to tailor the individualized learning program for every student.
          </p>
        </header>

        {/* Student Information panel */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm mb-8">
          <div className="px-6 py-4 border-b border-outline-variant/15 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg" style={fillStyle}>person</span>
            <h3 className="font-bold text-on-surface">Student Information</h3>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student ID</p>
              <p className="text-sm font-bold text-on-surface mt-1">{loading ? "…" : student?.student_id ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student Name</p>
              <p className="text-sm font-bold text-on-surface mt-1">{loading ? "…" : `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Grade Level</p>
              <p className="text-sm font-bold text-on-surface mt-1">{loading ? "…" : student?.grade_level?.level_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Assessment Date</p>
              <input
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Diagnostic Forms */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-on-surface">Diagnostic Forms</h3>
          <p className="text-sm text-on-surface-variant mt-0.5">All diagnostic forms are available. Choose a form to record the student's results.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {[1,2,3,4].map((i) => (
              <div key={i} className="bg-white border border-outline-variant/20 rounded-2xl p-5 animate-pulse space-y-3">
                <div className="h-10 w-10 bg-surface-container-high rounded-xl" />
                <div className="h-4 bg-surface-container-high rounded w-28" />
                <div className="h-3 bg-surface-container-high rounded w-full" />
                <div className="h-10 bg-surface-container-high rounded-xl mt-4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {SUBJECTS.map((subject) => {
              const row      = getSubjectRow(subject.label);
              const recorded = !!row;
              return (
                <div key={subject.key} className="bg-white border border-outline-variant/20 rounded-2xl p-5 flex flex-col shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-primary-fixed text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-lg" style={fillStyle}>{subject.icon}</span>
                  </div>
                  <h4 className="font-bold text-on-surface mt-3">{subject.label}</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1 flex-1">{subject.description}</p>

                  {/* Status */}
                  <div className="mt-4">
                    {recorded ? (
                      <>
                        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-green-600">
                          <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>
                          Result Recorded
                        </span>
                        <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mt-3">Ready to advance from:</p>
                        <span className="inline-block mt-1 text-xs font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">PACE {row.start_pace}</span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">
                          <span className="material-symbols-outlined text-base">radio_button_unchecked</span>
                          No Result Recorded
                        </span>
                        <p className="text-xs italic text-on-surface-variant mt-3">No diagnostic result has been recorded yet.</p>
                      </>
                    )}
                  </div>

                  {/* Record/View -> handleSubjectClick(subject) opens that subject's diagnostic modal */}
                  <div className="mt-4 pt-4 border-t border-outline-variant/10">
                    <button
                      onClick={() => handleSubjectClick(subject)}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-colors ${
                        recorded
                          ? "border border-outline-variant/40 text-on-surface hover:bg-surface-container-low"
                          : "bg-primary text-white hover:bg-primary/90"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{recorded ? "visibility" : "edit"}</span>
                      {recorded ? "View Results" : "Record Diagnostic"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate Projected PACE Recommendation */}
        <div className="mt-8 flex flex-col items-end gap-1.5">
          {/* Generate -> navigate() to ProjectedPaceRecommendation.jsx; disabled until hasResults */}
          <button
            onClick={() => navigate(`/admin/diagnostic/recommendation/${studentId}`)}
            disabled={!hasResults}
            title={hasResults ? "" : "Record at least one diagnostic result first"}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base" style={fillStyle}>description</span>
            Generate Projected PACE Recommendation
          </button>
          <p className="text-[11px] text-on-surface-variant max-w-xs text-right">
            This will generate the projected PACE and suggested placement based on the recorded results.
          </p>
        </div>
      </main>
    </PrincipalLayout>
  );
}

