// Student Diagnostic & PACE Details modal (principal). Opened from DiagnosticAssessments.jsx
// "View Details" (setViewTarget). Read-only: diagnostic results + system-recommended starting
// PACEs + the projected 4-quarter PACE plan.
// Backend chains (loads TWO endpoints in parallel):
//   diagnostics: GET /assessments/diagnostic?student_id (api/diagnosticAssessments.js fetchDiagnostics)
//        -> controllers/assessment.controller.js > getDiagnostics (~line 43) -> services/assessment.service.js > getDiagnosticsByStudent (~line 20)
//   plan:        GET /student-monitoring/:id/profile (api/studentMonitoring.js fetchStudentProfile)
//        -> controllers/studentMonitoring.controller.js > getStudentProfile (~line 13) -> services/studentMonitoring.service.js > getStudentProfile (~line 649)
import { useState, useEffect } from "react";
import { fetchDiagnostics } from "../api/diagnosticAssessments.js";
import { fetchStudentProfile } from "../api/studentMonitoring.js";
import { useAuth } from "../context/AuthContext.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const QUARTER_LABELS = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

const RESULT_TINTS = [
  { card: "bg-blue-50 border-blue-100",     icon: "text-blue-500",   value: "text-blue-600",   glyph: "ac_unit"  },
  { card: "bg-orange-50 border-orange-100", icon: "text-orange-500", value: "text-orange-600", glyph: "menu_book"},
  { card: "bg-green-50 border-green-100",    icon: "text-green-500",  value: "text-green-600",  glyph: "eco"      },
  { card: "bg-purple-50 border-purple-100", icon: "text-purple-500", value: "text-purple-600", glyph: "science"  },
];
const PACE_COLORS = ["text-blue-600", "text-orange-600", "text-green-600", "text-purple-600"];

// "Month D, YYYY" date, or em dash if missing/invalid
const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// label/value cell used in the summary bar
const SummaryCell = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{label}</p>
    <div className="text-sm font-bold text-on-surface mt-0.5 truncate">{children}</div>
  </div>
);

const InfoCard = ({ icon, iconColor, label, children }) => (
  <div className="border border-outline-variant/20 rounded-2xl p-4 text-center flex flex-col items-center">
    <span className={`material-symbols-outlined text-xl mb-2 ${iconColor}`} style={fillStyle}>{icon}</span>
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{label}</p>
    <p className="text-sm font-bold text-on-surface mt-1">{children}</p>
  </div>
);

// `student` is the row clicked in the Diagnostic Assessments table; onClose = () => setViewTarget(null).
export default function StudentDiagnosticDetailModal({ student, onClose }) {
  const { user } = useAuth();
  const [diag,    setDiag]    = useState([]);     // diagnostic result rows for this student
  const [profile, setProfile] = useState(null);   // the projected-plan payload (subjectPaces)
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const sid       = student.student_id;
  const fullName  = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
  const createdBy = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "Principal User"; // logged-in principal

  // load diagnostics + projected plan together; `cancelled` guards setState after unmount
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDiagnostics(sid), fetchStudentProfile(sid)])
      .then(([dRes, pRes]) => {
        if (cancelled) return;
        setDiag(dRes.data ?? []);
        setProfile(pRes.data ?? null);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [sid]);

  const gradeLevel   = student.grade_level?.level_name ?? profile?.student?.grade_level ?? "—";
  const dateAssessed = diag.find((d) => d.test_date)?.test_date ?? null;   // first recorded test date
  const subjectPaces = profile?.subjectPaces ?? {};                        // subject -> quarters -> paces (the projected plan)
  const planSubjects = Object.keys(subjectPaces);                          // plan table column headers

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-4 max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="px-7 pt-5 pb-4 border-b border-outline-variant/20 flex items-start justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-extrabold text-on-surface">Student Diagnostic &amp; PACE Details</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Summary bar */}
        <div className="px-7 py-4 bg-surface-container-lowest border-b border-outline-variant/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCell label="Student ID">{sid}</SummaryCell>
            <SummaryCell label="Student Name">{fullName || "—"}</SummaryCell>
            <SummaryCell label="Grade Level">{gradeLevel}</SummaryCell>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Placement Basis</p>
              <span className="inline-block mt-1 text-[11px] font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">Diagnostic Assessment</span>
            </div>
            <SummaryCell label="Date Assessed">{formatDate(dateAssessed)}</SummaryCell>
            <SummaryCell label="Created By">{createdBy}</SummaryCell>
          </div>
        </div>

        <div className="px-7 py-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 flex items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left column */}
              <div className="space-y-7">
                {/* Assessment information */}
                <section>
                  <h3 className="font-bold text-on-surface mb-3">Assessment Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <InfoCard icon="event" iconColor="text-blue-500" label="Date Assessed">{formatDate(dateAssessed)}</InfoCard>
                    <InfoCard icon="person" iconColor="text-indigo-500" label="Assessed By">{createdBy}</InfoCard>
                    <InfoCard icon="check_circle" iconColor="text-green-500" label="Placement Basis">Diagnostic Assessment</InfoCard>
                  </div>
                </section>

                {/* Diagnostic results — one tinted card per recorded subject (from `diag`) */}
                <section>
                  <h3 className="font-bold text-on-surface mb-3">Diagnostic Results</h3>
                  {diag.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">No diagnostic results recorded yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {diag.map((d, i) => {
                        const t = RESULT_TINTS[i % RESULT_TINTS.length];
                        return (
                          <div key={d.diag_id ?? i} className={`border rounded-2xl p-4 ${t.card}`}>
                            <span className={`material-symbols-outlined ${t.icon}`} style={fillStyle}>{t.glyph}</span>
                            <p className="text-sm font-extrabold text-on-surface mt-2 leading-tight">{d.subject}</p>
                            <p className="text-[11px] text-on-surface-variant mt-1">Ready to Advance from PACE</p>
                            <p className={`font-headline text-2xl font-extrabold mt-1 ${t.value}`}>{d.start_pace ?? "—"}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* System recommended starting PACEs */}
                <section>
                  <h3 className="font-bold text-on-surface mb-3">System Recommended Starting PACEs</h3>
                  <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                          <th className="text-left px-5 py-3 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Subject</th>
                          <th className="text-left px-5 py-3 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Recommended Starting PACE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {diag.length === 0 ? (
                          <tr><td colSpan={2} className="px-5 py-5 text-center text-on-surface-variant">No recommendations yet.</td></tr>
                        ) : diag.map((d, i) => (
                          <tr key={d.diag_id ?? i}>
                            <td className="px-5 py-3 text-on-surface">{d.subject}</td>
                            <td className={`px-5 py-3 font-bold ${PACE_COLORS[i % PACE_COLORS.length]}`}>{d.start_pace ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {/* Right column — projected PACE plan (from profile.subjectPaces): rows = 4 quarters
                  x 3 PACE slots, columns = subjects; getStudentProfile built this on the backend */}
              <div>
                <h3 className="font-bold text-on-surface">Projected PACE Plan</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 mb-3">
                  This shows the projected PACE sequence for each subject for the entire school year.
                </p>
                {planSubjects.length === 0 ? (
                  <div className="border border-outline-variant/20 rounded-xl py-16 text-center text-sm text-on-surface-variant">
                    No PACE projection recorded for this school year yet.
                  </div>
                ) : (
                  <div className="rounded-xl border border-outline-variant/20 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-container-lowest">
                          <th className="px-2.5 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant border-b border-outline-variant/20 whitespace-nowrap">Quarter</th>
                          {planSubjects.map((sub) => (
                            <th key={sub} className="px-2.5 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant border-b border-outline-variant/20 whitespace-nowrap">{sub}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {QUARTER_LABELS.map((ql, qi) => (
                          [0, 1, 2].map((slot) => (
                            <tr key={`${qi}-${slot}`} className="border-b border-outline-variant/10">
                              {slot === 0 && (
                                <td rowSpan={3} className="px-2.5 py-2 font-bold text-on-surface align-middle border-r border-outline-variant/10 whitespace-nowrap">
                                  {ql}
                                </td>
                              )}
                              {planSubjects.map((sub) => {
                                const pace = subjectPaces[sub]?.quarters?.[qi]?.paces?.[slot];
                                return (
                                  <td key={sub} className="px-2.5 py-1.5 text-center text-on-surface-variant tabular-nums">
                                    {pace ?? "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Export / Print -> window.print() (browser print-to-PDF; no backend) */}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-primary hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">print</span>
                    Export / Print
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-outline-variant/20 flex justify-end sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 sm:px-8 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
