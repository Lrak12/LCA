//incase rani if panels ask about how are students promoted, the logic is in services/rollover.service.js > previewRollover (~line 46) and commitRollover (~line 151)



// School Year Rollover (principal): preview each student's promotion for the next year,
// override per student, then commit - creating the new school year and re-placing every
// student.
// Backend chain (frontend api/rollover.js -> routes/rollover.routes.js):
//   preview: GET  /rollover/preview -> controllers/rollover.controller.js > preview (~line 5)  -> services/rollover.service.js > previewRollover (~line 46)
//   commit:  POST /rollover/commit  -> controllers/rollover.controller.js > commit (~line 10)  -> services/rollover.service.js > commitRollover (~line 151)

import { useState, useEffect } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchRolloverPreview, commitRollover } from "../../api/rollover.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// "2025–2026" → "2026–2027" (advance both years in the label)
const nextYearLabel = (label) => {
  if (!label || label === "—") return "";
  const parts = label.replace(/\s/g, "").split("–");
  if (parts.length < 2) return "";
  return `${Number(parts[0]) + 1}–${Number(parts[1]) + 1}`;
};
// add one year to an ISO date (for the proposed start/end dates)
const addYear = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
};

export default function SchoolYearRollover() {
  const schoolYearLabel = useSchoolYear();

  const [data, setData]       = useState(null);        // rollover preview payload
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // New school year fields (pre-filled with next year's label + dates)
  const [yearLabel, setYearLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");

  // Per-student overrides: rows keyed by student_id → { promote: bool }
  const [overrides, setOverrides] = useState({});

  // View filter — by current grade level (does not affect what gets committed)
  const [gradeFilter, setGradeFilter] = useState("all");

  const [confirming, setConfirming] = useState(false); // confirm dialog open?
  const [committing, setCommitting] = useState(false);
  const [done,       setDone]       = useState(null);  // result after commit
  const [commitError, setCommitError] = useState("");

  // load the preview; seed the new-year fields + each student's promote flag
  useEffect(() => {
    fetchRolloverPreview()
      .then((res) => {
        const d = res.data;
        setData(d);
        setYearLabel(nextYearLabel(d.schoolYear?.year_label));
        setStartDate(addYear(d.schoolYear?.start_date));
        setEndDate(addYear(d.schoolYear?.end_date));
        // Default each student's promote flag to the system recommendation
        const init = {};
        (d.students ?? []).forEach((s) => { init[s.student_id] = s.canPromote; });
        setOverrides(init);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const students = data?.students ?? [];
  const grades   = data?.grades ?? [];
  const promoteCount = students.filter((s) => overrides[s.student_id]).length; // how many will be promoted

  // Grades that actually have students, for the filter dropdown
  const gradeOptions = grades.filter((g) => students.some((s) => s.currentGlId === g.gl_id));
  const visibleStudents = gradeFilter === "all"
    ? students
    : students.filter((s) => String(s.currentGlId) === String(gradeFilter));

  // display name of a student's proposed next grade
  const nextGradeName = (s) =>
    grades.find((g) => g.gl_id === s.proposedGlId)?.level_name ?? s.proposedGrade;

  // flip one student's promote decision
  const togglePromote = (id) =>
    setOverrides((prev) => ({ ...prev, [id]: !prev[id] }));

  // commit the rollover: create the new year and place every student in the right grade
  const handleCommit = async () => {
    if (!yearLabel.trim() || !startDate || !endDate) {
      setCommitError("Fill in the new school year label, start and end dates.");
      return;
    }
    setCommitting(true);
    setCommitError("");
    try {
      const payload = {
        year_label: yearLabel.trim(),
        start_date: startDate,
        end_date:   endDate,
        students: students.map((s) => ({
          student_id: s.student_id,
          // promoted → proposed (next) grade; else keep current grade
          gl_id:      overrides[s.student_id] ? s.proposedGlId : s.currentGlId,
          basis:      s.basis,
        })),
      };
      const res = await commitRollover(payload);
      setDone(res.data);
    } catch (err) {
      setCommitError(err.response?.data?.message ?? err.message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-[1100px] mx-auto w-full">

        {/* Header */}
        <header className="mb-6">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary uppercase">
            Start New School Year
          </h2>
          <p className="text-on-surface-variant mt-1 max-w-2xl">
            Promote students who finished their grade's PACEs and carry everyone's projection
            into the new year. Students continue from their last completed PACE no passed work is repeated.
          </p>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Success state */}
        {done && (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4 sm:p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-green-600 text-3xl" style={fillStyle}>check_circle</span>
            </div>
            <p className="text-lg font-extrabold text-on-surface">School Year {done.year_label} started</p>
            <p className="text-sm text-on-surface-variant mt-1">
              {done.studentsProjected} students projected · {done.rowsGenerated} PACE rows generated.
            </p>
            <p className="text-xs text-on-surface-variant mt-3">
              Teachers can fine-tune any student's plan in Pace Monitoring.
            </p>
          </div>
        )}

        {!done && (loading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* New year setup card */}
            <section className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 mb-5">
              <h3 className="text-sm font-extrabold text-primary uppercase tracking-wide mb-1">
                New School Year
              </h3>
              <p className="text-xs text-on-surface-variant mb-4">
                Rolling over from <strong>{data?.schoolYear?.year_label ?? "—"}</strong>. The new year becomes the active one.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Year Label</label>
                  <input
                    value={yearLabel}
                    onChange={(e) => setYearLabel(e.target.value)}
                    placeholder="2026–2027"
                    className="w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </section>

            {/* Students table */}
            <section className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden mb-5">
              <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-sm font-extrabold text-primary uppercase tracking-wide">
                    Students ({students.length})
                  </h3>
                  <div className="relative">
                    <select
                      value={gradeFilter}
                      onChange={(e) => setGradeFilter(e.target.value)}
                      className="appearance-none text-xs font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                    >
                      <option value="all">All grade levels</option>
                      {gradeOptions.map((g) => (
                        <option key={g.gl_id} value={g.gl_id}>{g.level_name}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 16 }}>expand_more</span>
                  </div>
                  {gradeFilter !== "all" && (
                    <span className="text-xs text-on-surface-variant">showing {visibleStudents.length}</span>
                  )}
                </div>
                <span className="text-xs font-bold text-on-surface-variant">
                  {promoteCount} promoting · {students.length - promoteCount} staying
                </span>
              </div>

              {students.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-on-surface-variant">No students to roll over.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                        <th className="text-left text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-6 py-3">Student</th>
                        <th className="text-left text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-3 py-3">Current Grade</th>
                        <th className="text-left text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-3 py-3">Core PACEs Finished</th>
                        <th className="text-center text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-3 py-3">Promote?</th>
                        <th className="text-left text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-6 py-3">New Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {visibleStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm text-on-surface-variant">
                            No students in this grade level.
                          </td>
                        </tr>
                      ) : visibleStudents.map((s) => {
                        const promote = overrides[s.student_id];
                        return (
                          <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="px-6 py-3 font-bold text-on-surface whitespace-nowrap">
                              {s.name}
                              <span className="block text-[10px] font-normal text-on-surface-variant">#{s.student_id}</span>
                            </td>
                            <td className="px-3 py-3 text-on-surface-variant whitespace-nowrap">{s.currentGrade}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {s.coreStatus.map((c) => (
                                  <span
                                    key={c.subject}
                                    title={`${c.subject}: completed ${c.completed ?? "—"} / target ${c.target ?? "—"}`}
                                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${c.met ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                                  >
                                    {c.subject.slice(0, 4)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            {/* promote toggle -> togglePromote(student_id) flips this student's promote decision */}
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => togglePromote(s.student_id)}
                                disabled={!s.canPromote && !promote}
                                className={`relative w-11 h-6 rounded-full transition-colors ${promote ? "bg-green-500" : "bg-slate-300"} ${!s.canPromote && !promote ? "opacity-40 cursor-not-allowed" : ""}`}
                                title={s.canPromote ? "" : "System did not detect grade completion — toggle to promote anyway"}
                              >
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${promote ? "left-[22px]" : "left-[2px]"}`} />
                              </button>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                              {promote ? (
                                <span className="inline-flex items-center gap-1 font-bold text-green-700">
                                  <span className="material-symbols-outlined text-sm" style={fillStyle}>arrow_upward</span>
                                  {nextGradeName(s)}
                                </span>
                              ) : (
                                <span className="text-on-surface-variant">{s.currentGrade} <span className="text-[10px]">(stays)</span></span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Commit bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-on-surface-variant max-w-md">
                <span className="material-symbols-outlined text-amber-500 text-sm align-middle mr-1" style={fillStyle}>info</span>
                This creates the new school year and makes it active. Each student's projection
                is seeded from their last completed PACE. You can edit individuals later in Pace Monitoring.
              </p>
              {commitError && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">error</span>{commitError}
                </p>
              )}
              {/* Start New School Year -> setConfirming(true) reveals Cancel + Confirm (two-step guard) */}
              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!students.length}
                  className="px-6 py-3 bg-primary text-white text-sm font-extrabold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  Start New School Year
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  {/* Cancel -> setConfirming(false); Confirm -> handleCommit() (commitRollover) */}
                  <button onClick={() => setConfirming(false)} disabled={committing}
                    className="px-4 py-3 text-sm font-bold rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container-low transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleCommit} disabled={committing}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-extrabold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                    {committing && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {committing ? "Working…" : `Confirm — promote ${promoteCount}, project ${students.length}`}
                  </button>
                </div>
              )}
            </div>
          </>
        ))}
      </main>
    </PrincipalLayout>
  );
}
