// Projected PACE Recommendation (principal): after diagnostics are recorded, review the
// system-recommended starting PACEs, accept or modify them, then proceed to the plan
// modal. Reached from RecordDiagnostic.jsx "Generate".
// Backend chain:
//   student's diagnostics: GET /assessments/diagnostic?student_id (api/diagnosticAssessments.js fetchDiagnostics)
//        -> controllers/assessment.controller.js > getDiagnostics (~line 43) -> services/assessment.service.js > getDiagnosticsByStudent (~line 20)
//   student record:        GET /students/:id -> controllers/student.controller.js > getById (~line 10) -> services/student.service.js > getStudentById (~line 101)
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchDiagnostics } from "../../api/diagnosticAssessments.js";
import client from "../../api/client.js";
import ProjectedPacePlanModal from "./ProjectedPacePlanModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// Modify dropdown: a window around the recommended starting PACE (-2 to +12).
const paceOptions = (start) => {
  const s = Number(start);
  if (!s || isNaN(s)) return [];
  const lo = Math.max(1, s - 2);
  const opts = [];
  for (let n = lo; n <= s + 12; n++) opts.push(n);
  return opts;
};

export default function ProjectedPaceRecommendation() {
  const { studentId } = useParams();
  const navigate        = useNavigate();
  const schoolYearLabel = useSchoolYear();

  const [student,   setStudent]   = useState(null);
  const [diag,      setDiag]      = useState([]);       // recorded diagnostic rows (with a start_pace)
  const [decision,  setDecision]  = useState("accept"); // accept | modify
  const [overrides, setOverrides] = useState({});       // subject → chosen pace (Modify mode)
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [planPaces, setPlanPaces] = useState(null);     // chosen starts → opens plan modal

  // load the student + their recorded diagnostics; seed overrides with the recommended PACEs
  useEffect(() => {
    let cancelled = false;                              // guard against setState after unmount
    Promise.all([client.get(`/students/${studentId}`), fetchDiagnostics(studentId)])
      .then(([stuRes, diagRes]) => {
        if (cancelled) return;
        setStudent(stuRes.data);
        const rows = (diagRes.data ?? []).filter((r) => r.start_pace != null); // only recorded subjects
        setDiag(rows);
        const init = {};
        rows.forEach((r) => { init[r.subject] = r.start_pace; }); // default each override to the recommendation
        setOverrides(init);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [studentId]);

  const setOverride = (subject, val) => setOverrides((o) => ({ ...o, [subject]: Number(val) })); // Modify dropdown change

  // build the final per-subject start PACEs (accepted or modified) and open the plan modal
  const handleProceed = () => {
    const paces = {};
    diag.forEach((d) => {
      paces[d.subject] = decision === "modify" ? (overrides[d.subject] ?? d.start_pace) : d.start_pace;
    });
    setPlanPaces(paces); // open the editable Projected PACE Plan modal
  };

  const fullName = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "—";

  return (
    <PrincipalLayout schoolYearLabel={loading ? "..." : schoolYearLabel}>
      <main className="p-8 w-full max-w-7xl">

        {/* Breadcrumb + back */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <nav className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest flex-wrap">
            <button onClick={() => navigate("/admin/diagnostic")} className="text-on-surface-variant hover:text-primary transition-colors">Diagnostic Assessment Management</button>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
            <button onClick={() => navigate("/admin/diagnostic")} className="text-on-surface-variant hover:text-primary transition-colors">Select Student for Diagnostic Assessment</button>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
            <button onClick={() => navigate(`/admin/diagnostic/record/${studentId}`)} className="text-on-surface-variant hover:text-primary transition-colors">Record Diagnostic Assessment</button>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
            <span className="text-secondary">Projected PACE Recommendation</span>
          </nav>
          <button
            onClick={() => navigate(`/admin/diagnostic/record/${studentId}`)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to Record Diagnostic
          </button>
        </div>

        {/* Header */}
        <header className="mb-6">
          <h2 className="text-3xl font-extrabold text-primary font-headline tracking-tight">Projected PACE Recommendation</h2>
          <p className="text-on-surface-variant text-sm mt-1 leading-relaxed max-w-2xl">
            Review the system-generated projected PACE recommendation before creating the student's projected PACE plan.
          </p>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-24 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
          </div>
        ) : (
          <>
            {/* Student Information */}
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm mb-6">
              <div className="px-6 py-4 border-b border-outline-variant/15 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg" style={fillStyle}>person</span>
                <h3 className="font-bold text-on-surface">Student Information</h3>
              </div>
              <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student ID</p>
                  <p className="text-sm font-bold text-on-surface mt-1">{student?.student_id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Student Name</p>
                  <p className="text-sm font-bold text-on-surface mt-1">{fullName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Grade Level</p>
                  <p className="text-sm font-bold text-on-surface mt-1">{student?.grade_level?.level_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Placement Basis</p>
                  <span className="inline-block mt-1 text-[11px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">Diagnostic Assessment</span>
                </div>
              </div>
            </div>

            {/* Two summary panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Diagnostic Results Summary */}
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-500 text-lg" style={fillStyle}>description</span>
                  <h3 className="font-bold text-on-surface">Diagnostic Results Summary</h3>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 mb-4">Based on the recorded diagnostic assessments.</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/15">
                      <th className="text-left py-2.5 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Diagnostic Form</th>
                      <th className="text-left py-2.5 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Ready to Advance From</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {diag.map((d) => (
                      <tr key={d.diag_id ?? d.subject}>
                        <td className="py-3 text-on-surface">{d.subject}</td>
                        <td className="py-3">
                          <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">PACE {d.start_pace}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* System Generated Recommendation */}
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-500 text-lg" style={fillStyle}>check_circle</span>
                  <h3 className="font-bold text-on-surface">System Generated Recommendation</h3>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 mb-4">Recommended starting PACEs for each subject.</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant/15">
                      <th className="text-left py-2.5 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Subject</th>
                      <th className="text-left py-2.5 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Recommended Starting PACE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {diag.map((d) => (
                      <tr key={d.diag_id ?? d.subject}>
                        <td className="py-3 text-on-surface">{d.subject}</td>
                        <td className="py-3 font-bold text-on-surface">{d.start_pace}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Principal Decision */}
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-lg" style={fillStyle}>how_to_reg</span>
                <h3 className="font-bold text-on-surface">Principal Decision</h3>
              </div>

              {/* Accept / Modify options -> setDecision(key); Modify reveals the per-subject override dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "accept", label: "Accept Recommendation", desc: "Use the system-generated recommended PACEs as the starting PACEs." },
                  { key: "modify", label: "Modify Recommendation", desc: "Modify the recommended starting PACEs for each subject (within grade-level limits)." },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDecision(opt.key)}
                    className={`flex items-start gap-3 text-left p-4 rounded-xl border-2 transition-colors ${
                      decision === opt.key ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-xl shrink-0 ${decision === opt.key ? "text-primary" : "text-on-surface-variant"}`}
                      style={decision === opt.key ? fillStyle : undefined}
                    >
                      {decision === opt.key ? "radio_button_checked" : "radio_button_unchecked"}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-on-surface">{opt.label}</span>
                      <span className="block text-[11px] text-on-surface-variant mt-0.5 leading-snug">{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              {decision === "modify" && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {diag.map((d) => (
                    <div key={d.diag_id ?? d.subject}>
                      <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">{d.subject}</label>
                      {/* per-subject override -> setOverride(subject, value) */}
                      <select
                        value={overrides[d.subject] ?? d.start_pace}
                        onChange={(e) => setOverride(d.subject, e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm focus:outline-none focus:border-primary bg-white"
                      >
                        {paceOptions(d.start_pace).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => navigate(`/admin/diagnostic/record/${studentId}`)}
                className="px-6 py-3 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProceed}
                disabled={diag.length === 0}
                className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                Proceed to Projected PACE Plan <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
          </>
        )}
      </main>

      {planPaces && (
        <ProjectedPacePlanModal
          student={student}
          studentId={studentId}
          recommended={planPaces}
          schoolYearLabel={schoolYearLabel}
          onBack={() => setPlanPaces(null)}
          onCancel={() => navigate("/admin/diagnostic")}
          onSaved={() => navigate("/admin/diagnostic")}
        />
      )}
    </PrincipalLayout>
  );
}
