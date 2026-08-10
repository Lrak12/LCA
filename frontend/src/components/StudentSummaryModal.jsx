// "View Student Details" modal, opened from the principal Student Monitoring page
// (setSelectedStudent). Read-only: info + PACE progress summary + projected plan + ranking.
// Backend chain (frontend api/studentMonitoring.js fetchStudentSummary -> routes/studentMonitoring.routes.js):
//   GET /student-monitoring/:id/summary -> controllers/studentMonitoring.controller.js > getStudentSummary (~line 26)
//                                        -> services/studentMonitoring.service.js > getStudentSummary (~line 452)
//   (getStudentSummary reuses buildRecommendation + getPaceAnalytics internally, so the numbers
//    here match the Records/Recommendations/Analytics tabs.)
import { useState, useEffect } from "react";
import { fetchStudentSummary, fetchStudentProfile } from "../api/studentMonitoring.js";
import ProjectedPacePlanModal from "../pages/principal/ProjectedPacePlanModal.jsx";
import EditStudentModal from "./EditStudentModal.jsx";
import { useSchoolYear } from "../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// Label : value row
const Field = ({ label, children }) => (
  <div className="flex items-start text-sm gap-2">
    <span className="text-on-surface-variant min-w-[120px] shrink-0">{label}</span>
    <span className="text-on-surface-variant">:</span>
    <span className="font-bold text-on-surface flex-1 min-w-0">{children}</span>
  </div>
);

const Section = ({ icon, title, action, children }) => (
  <section className="border border-outline-variant/30 rounded-2xl p-5">
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>{icon}</span>
        <h3 className="font-bold text-primary">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Pill = ({ tone = "green", children }) => {
  const tones = {
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    grey:  "bg-surface-container-high text-on-surface-variant",
  };
  return (
    <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full ${tones[tone]}`}>
      {children}
    </span>
  );
};

const statusTone = (status) =>
  status === "Completed" ? "green" : status === "In Progress" ? "amber" : "grey";

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-surface-container-high rounded h-4 ${className}`} />
);

// Shows student info, PACE progress summary, projected plan, and ranking.
// "View Full Plan" opens the editable ProjectedPacePlanModal (the per-quarter PACE grid).
// `studentId` = the row's id (set by the page's setSelectedStudent); onClose = () => setSelectedStudent(null).
export default function StudentSummaryModal({ studentId, onClose, onUpdated }) {
  const schoolYearLabel = useSchoolYear();
  const [data, setData]       = useState(null);    // getStudentSummary payload
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [showFullPlan, setShowFullPlan] = useState(false); // is the nested projected-plan modal open?
  const [planProjection, setPlanProjection] = useState(null); // subjectPaces seed for the plan grid
  const [planLoading, setPlanLoading]       = useState(false); // fetching the projection before opening
  const [editing, setEditing] = useState(false);   // is the Edit Information modal open?
  const [reloadKey, setReloadKey] = useState(0);   // bump to refetch after an edit

  // fetch this student's summary; `cancelled` guards setState after unmount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchStudentSummary(studentId);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [studentId, reloadKey]);

  const s    = data?.student;          // identity fields
  const pace = data?.paceSummary;      // counts + completion rate + status + points
  const plan = data?.projectedPlan ?? []; // per-subject projected PACE range
  const rank = data?.ranking;          // current + grade-level rank

  // Load the saved projection (subjectPaces shape) the plan modal needs to seed its
  // editable grid, then open it. Falls back to defaults if the fetch fails.
  const openFullPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await fetchStudentProfile(studentId);
      setPlanProjection(res.data?.subjectPaces ?? {});
    } catch {
      setPlanProjection({});
    } finally {
      setPlanLoading(false);
      setShowFullPlan(true);
    }
  };
  const closeFullPlan = () => { setShowFullPlan(false); setPlanProjection(null); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-outline-variant/20 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">View Student Details</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">Detailed student information and PACE record</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="border border-outline-variant/30 rounded-2xl p-5 space-y-3">
                  <SkeletonLine className="w-40" />
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-2/3" />
                </div>
              ))}
            </div>
          ) : !data ? null : (
            <>
              {/* Student Information */}
              <Section
                icon="person"
                title="Student Information"
                action={
                  /* Edit Information -> setEditing(true) opens <EditStudentModal> */
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-xs font-bold text-primary hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    Edit Information
                  </button>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Student ID">{s.student_id}</Field>
                  <Field label="Grade Level">{s.grade_level}</Field>
                  <Field label="Student Name">{s.full_name}</Field>
                  <Field label="Enrollment Date">{formatDate(s.enrollment_date)}</Field>
                  <Field label="Gender">{s.gender ?? "—"}</Field>
                  <Field label="Address">{s.address ?? "—"}</Field>
                  <Field label="Date of Birth">{formatDate(s.date_of_birth)}</Field>
                  <Field label="Contact Number">{s.contact_number ?? "—"}</Field>
                </div>
                <div className="mt-4 pt-4 border-t border-outline-variant/20 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Parent / Guardian">{s.parent_name ?? "—"}</Field>
                  <Field label="Relationship">{s.parent_relationship ?? "—"}</Field>
                </div>
              </Section>

              {/* PACE Progress Summary */}
              <Section icon="leaderboard" title="PACE Progress Summary">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Total PACEs">{pace.assigned}</Field>
                  <Field label="Complete with Extension">{"—"}</Field>
                  <Field label="Completed PACEs">{pace.completed}</Field>
                  <Field label="PACE Test not Passed">{pace.testNotPassed}</Field>
                  <Field label="PACE Status"><Pill tone={statusTone(pace.paceStatus)}>{pace.paceStatus}</Pill></Field>
                  <Field label="Completed On-Time">{pace.completedOnTime}</Field>
                  <Field label="Performance Points">{pace.pointsEarned}</Field>
                  <Field label="Completed Late">{pace.completedLate}</Field>
                  <Field label="PACE Test Readiness">
                    <Pill tone={pace.readiness === "Yes" ? "green" : "grey"}>{pace.readiness}</Pill>
                  </Field>
                </div>
              </Section>

              {/* Projected PACE Plan */}
              <Section icon="schedule" title="Projected PACE Plan">
                {plan.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No PACE projection recorded for this school year yet.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                            <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-left px-5 py-3">Subject Area</th>
                            <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-left px-5 py-3">Projected PACE Range</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {plan.map((row) => (
                            <tr key={row.subject}>
                              <td className="px-5 py-3 text-sm font-bold text-on-surface">{row.subject}</td>
                              <td className="px-5 py-3 text-sm text-on-surface">{row.range}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* View Full Plan -> openFullPlan() fetches the projection then opens <ProjectedPacePlanModal> */}
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={openFullPlan}
                        disabled={planLoading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-primary hover:bg-surface-container-low transition-colors disabled:opacity-60"
                      >
                        <span className={`material-symbols-outlined text-base ${planLoading ? "animate-spin" : ""}`} style={fillStyle}>
                          {planLoading ? "progress_activity" : "visibility"}
                        </span>
                        {planLoading ? "Loading…" : "View Full Plan"}
                      </button>
                    </div>
                  </>
                )}
              </Section>

              {/* Ranking Information */}
              <Section icon="workspace_premium" title="Ranking Information">
                <div className="space-y-3">
                  <Field label="Current Rank">{rank.currentRank ?? "Unranked"}</Field>
                  <Field label="Grade Level Rank">{rank.gradeLevelRank ?? "—"}</Field>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-center border-t border-outline-variant/20 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-10 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* nested full-plan modal: `showFullPlan` -> editable ProjectedPacePlanModal (same as the
          Projected PACE Plan tab). Saving persists the projection, then refetches this summary. */}
      {showFullPlan && s && planProjection && (
        <ProjectedPacePlanModal
          student={{
            student_id: s.student_id,
            grade_level: s.grade_level,   // string label; modal falls back to it for display
            first_name: s.full_name,      // modal builds its display name from first + last
            last_name: "",
          }}
          studentId={s.student_id}
          initialProjection={planProjection}
          hideBackToRecommendation
          schoolYearLabel={schoolYearLabel}
          onBack={closeFullPlan}
          onCancel={closeFullPlan}
          onSaved={() => { closeFullPlan(); setReloadKey((k) => k + 1); onUpdated?.(); }}
        />
      )}

      {/* Edit Information modal: on save, refetch the summary + notify the page to reload its list */}
      {editing && s && (
        <EditStudentModal
          student={s}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setReloadKey((k) => k + 1); onUpdated?.(); }}
        />
      )}
    </div>
  );
}
