// Student Full Plan / Profile modal (principal). Opened from StudentSummaryModal's
// "View Full Plan" button - the per-subject PACE grade grid + attendance + 100s/homework lists.
// Backend chain (frontend api/studentMonitoring.js fetchStudentProfile -> routes/studentMonitoring.routes.js):
//   GET /student-monitoring/:id/profile -> controllers/studentMonitoring.controller.js > getStudentProfile (~line 13)
//                                        -> services/studentMonitoring.service.js > getStudentProfile (~line 649)
import { useState, useEffect } from "react";
import { fetchStudentProfile } from "../api/studentMonitoring.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const PREVIEW_LIMIT = 5;   // rows shown before a list section needs "show more"

// ─── Helpers ──────────────────────────────────────────────────────────────────

// "Month D, YYYY" date, or em dash / raw string if unparseable
const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const round2 = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : null); // 2-decimal round, null-safe

// average of the numeric scores in one quarter (null if none entered)
function quarterTotal(scores) {
  const nums = scores.filter((s) => typeof s === "number");
  if (!nums.length) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// average across a subject's quarters (average of quarter averages)
function subjectAverage(quarters) {
  const totals = quarters.map((q) => quarterTotal(q.scores)).filter((t) => t !== null);
  if (!totals.length) return null;
  return round2(totals.reduce((a, b) => a + b, 0) / totals.length);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ScoreCell = ({ value }) => {
  if (value === "ongoing") return (
    <span className="inline-block text-[11px] font-bold bg-orange-100 text-orange-600 px-2.5 py-0.5 rounded-full whitespace-nowrap">
      Ongoing
    </span>
  );
  if (value === "not_started") return (
    <span className="text-xs text-slate-400 font-medium">Not Started</span>
  );
  return (
    <span className="inline-block text-[11px] font-extrabold bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">
      {value}
    </span>
  );
};

const AttendanceCard = ({ icon, iconBg, label, value, bg }) => (
  <div className={`rounded-2xl p-5 flex items-center gap-4 ${bg}`}>
    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>
      <span className="material-symbols-outlined text-xl text-white" style={fillStyle}>{icon}</span>
    </div>
    <div>
      <p className="text-xs font-bold text-on-surface-variant mb-0.5">{label}</p>
      <p className="text-3xl font-extrabold text-on-surface font-headline">{value}</p>
    </div>
  </div>
);

const SkeletonBlock = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded ${className}`} />
);

// ─── Expandable list (PACEs Brought Home / 100s Achieved) ────────────────────

const ListSection = ({ title, icon, iconBg, count, rows, col1Label, col2Label, col1Key, col2Key }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PREVIEW_LIMIT);
  const hasMore = rows.length > PREVIEW_LIMIT;

  return (
    <div className="col-span-12 md:col-span-4 bg-white rounded-2xl border border-outline-variant/20 overflow-hidden">
      <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{title}</p>
          <p className="text-xl font-extrabold text-on-surface font-headline">{count}</p>
        </div>
      </div>
      <div className="px-5">
        {rows.length === 0 ? (
          <p className="py-4 text-xs text-on-surface-variant">No records yet.</p>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant py-3 text-left">{col1Label}</th>
                  <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant py-3 text-right">{col2Label}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {visible.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest">
                    <td className="py-3 text-sm font-bold text-on-surface">{r[col1Key]}</td>
                    <td className="py-3 text-xs text-on-surface-variant text-right whitespace-nowrap">
                      {formatDate(r[col2Key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 text-xs font-bold text-primary py-3 hover:underline"
              >
                {expanded ? "Show less" : `See all (${rows.length})`}
                <span className="material-symbols-outlined text-sm">
                  {expanded ? "expand_less" : "chevron_right"}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

// `student` carries at least student_id; onClose = () => setShowFullPlan(false) (from StudentSummaryModal).
export default function StudentProfileModal({ student, onClose }) {
  const [profile,    setProfile]    = useState(null);   // getStudentProfile payload
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [activeTab,  setActiveTab]  = useState(null);   // which subject's grade grid is showing

  const studentId = student.student_id || student.id;

  // load the full profile; default the active tab to the first subject
  useEffect(() => {
    setLoading(true);
    setError("");
    fetchStudentProfile(studentId)
      .then((res) => {
        setProfile(res.data);
        const subjects = Object.keys(res.data.subjectPaces ?? {});
        if (subjects.length) setActiveTab(subjects[0]);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  // Profile display values — use API data when available, fall back to props
  const firstName   = profile?.student.first_name    ?? student.firstName    ?? student.first_name   ?? "";
  const lastName    = profile?.student.last_name     ?? student.lastName     ?? student.last_name    ?? "";
  const fullName    = `${firstName} ${lastName}`.trim();
  const dob         = profile?.student.date_of_birth ?? student.dob          ?? student.date_of_birth ?? null;
  const gender      = profile?.student.gender        ?? student.gender        ?? "—";
  const address     = profile?.student.address       ?? student.address       ?? "—";
  const contact     = profile?.student.contact_number ?? student.contact      ?? student.contact_number ?? "—";
  const gradeLevel  = profile?.student.grade_level   ?? student.gradeLevel   ?? student.grade_level  ?? "—";

  // sections of the profile payload (all built by getStudentProfile on the backend)
  const paceStats      = profile?.paceStats      ?? null;   // completed / ongoing / remaining counts
  const subjectPaces   = profile?.subjectPaces   ?? {};     // subject -> quarters -> PACE scores (the grade grid)
  const attendance     = profile?.attendance     ?? null;   // present / absent / tardy totals
  const boughtHome     = profile?.pacesBroughtHome   ?? []; // homework PACE list
  const hundreds       = profile?.hundredsAchieved   ?? []; // 100-score PACE list
  const subjects       = Object.keys(subjectPaces);         // subject tab labels
  const subjectData    = activeTab ? subjectPaces[activeTab] : null; // the selected subject's grid

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[960px] my-4 flex flex-col overflow-hidden">

        {/* ── Modal Header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20 bg-white">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant mt-0.5">
              <span className="material-symbols-outlined text-base">edit_square</span>
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-on-surface">Student Profile and Academic Recording</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Official student academic records and grading information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* ── Error banner ───────────────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Scrollable body ────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">

          {/* ── Profile Section ──────────────────────────────────────────── */}
          <div className="p-6 grid grid-cols-12 gap-5">

            {/* Left: Avatar + ID + Average Score */}
            <div className="col-span-12 md:col-span-3 flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-primary-fixed flex items-center justify-center shrink-0">
                  <span className="text-2xl font-extrabold text-primary">
                    {firstName[0]}{lastName[0]}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-on-surface">{fullName}</p>
                  <span className="inline-block mt-1 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                    Student ID: {studentId}
                  </span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-2xl p-4 flex flex-col items-center gap-1 border border-blue-100">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mb-1">
                  <span className="material-symbols-outlined text-white text-base" style={fillStyle}>star</span>
                </div>
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-blue-500">Average Score</p>
                {loading ? (
                  <SkeletonBlock className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-3xl font-extrabold text-blue-700 font-headline">
                    {paceStats?.averageScore != null ? `${paceStats.averageScore}%` : "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Middle: Student Info */}
            <div className="col-span-12 md:col-span-5 flex flex-col justify-center gap-3">
              {[
                { icon: "cake",        label: `Date of Birth: ${formatDate(dob)}`  },
                { icon: "person",      label: `Gender: ${gender}`                   },
                { icon: "school",      label: `Grade Level: ${gradeLevel}`          },
                { icon: "location_on", label: address                               },
                { icon: "phone",       label: contact                               },
              ].map(({ icon, label }) => (
                <div key={icon} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-on-surface-variant text-base mt-0.5 shrink-0" style={fillStyle}>{icon}</span>
                  <p className="text-sm text-on-surface leading-snug">{label}</p>
                </div>
              ))}
            </div>

            {/* Right: PACE Stats */}
            <div className="col-span-12 md:col-span-4 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex flex-col gap-1">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center mb-1">
                    <span className="material-symbols-outlined text-white text-base" style={fillStyle}>schedule</span>
                  </div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-orange-500">Ongoing PACEs</p>
                  {loading ? <SkeletonBlock className="h-8 w-10" /> : (
                    <p className="text-3xl font-extrabold text-orange-600 font-headline">{paceStats?.ongoing ?? 0}</p>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-1">
                  <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center mb-1">
                    <span className="material-symbols-outlined text-white text-base" style={fillStyle}>remove_circle</span>
                  </div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-slate-500">Remaining PACEs</p>
                  {loading ? <SkeletonBlock className="h-8 w-10" /> : (
                    <p className="text-3xl font-extrabold text-slate-600 font-headline">{paceStats?.remaining ?? 0}</p>
                  )}
                </div>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-base" style={fillStyle}>check_circle</span>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-green-600">Completed PACEs</p>
                  {loading ? <SkeletonBlock className="h-8 w-10" /> : (
                    <p className="text-3xl font-extrabold text-green-700 font-headline">{paceStats?.completed ?? 0}</p>
                  )}
                </div>
              </div>

              {/* Proceed to Next PACE — only when teacher marked ready */}
              {!loading && paceStats?.readyForNext && (
                <button className="w-full bg-primary text-white text-sm font-extrabold py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
                  Proceed to Next PACE
                </button>
              )}
            </div>
          </div>

          {/* ── Subject Tabs -> setActiveTab(subject) picks which subject's grade grid renders ── */}
          {!loading && subjects.length > 0 && (
            <div className="px-6 border-t border-outline-variant/20">
              <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
                {subjects.map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveTab(s)}
                    className={`shrink-0 text-xs font-bold px-4 py-2 rounded-full transition-colors whitespace-nowrap ${
                      activeTab === s
                        ? "bg-on-surface text-white"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Subject Table ─────────────────────────────────────────────── */}
          <div className="px-6 py-4 grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-9 bg-white rounded-2xl border border-outline-variant/20 overflow-hidden">
              <div className="px-5 py-3 border-b border-outline-variant/10">
                <h3 className="text-xs font-extrabold tracking-widest uppercase text-on-surface">
                  {activeTab ?? "PACE Scores"}
                </h3>
              </div>

              {loading ? (
                <div className="p-5 space-y-3">
                  {[1,2,3,4].map((i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
                </div>
              ) : !subjectData ? (
                <p className="px-5 py-8 text-sm text-on-surface-variant text-center">No PACE data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                        <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 text-left">Quarter</th>
                        {["1st PACE", "2nd PACE", "3rd PACE"].map((h) => (
                          <th key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 text-center whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                        <th className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 text-center">Total Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {subjectData.quarters.map((row) => {
                        const total = quarterTotal(row.scores);
                        return (
                          <tr key={row.label} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="px-5 py-4 text-sm font-bold text-on-surface whitespace-nowrap">{row.label}</td>
                            {row.scores.map((score, i) => (
                              <td key={i} className="px-5 py-4 text-center">
                                {row.paces?.[i] != null && (
                                  <p className="text-[10px] font-bold text-slate-400 mb-1 whitespace-nowrap">PACE {row.paces[i]}</p>
                                )}
                                <ScoreCell value={score} />
                              </td>
                            ))}
                            <td className="px-5 py-4 text-center font-extrabold text-primary text-sm">
                              {total !== null ? total.toFixed(2) : <span className="text-on-surface-variant font-medium">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Average row */}
                      <tr className="bg-surface-container-lowest border-t-2 border-outline-variant/30">
                        <td className="px-5 py-4 text-sm font-extrabold text-on-surface" colSpan={4}>
                          Average
                        </td>
                        <td className="px-5 py-4 text-center font-extrabold text-primary text-sm">
                          {(() => {
                            const avg = subjectAverage(subjectData.quarters);
                            return avg !== null ? avg.toFixed(2) : <span className="text-on-surface-variant font-medium">—</span>;
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="col-span-12 lg:col-span-3">
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-5">
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface mb-4">PACE Status Legend</p>
                <div className="space-y-4">
                  {[
                    { color: "bg-green-500",  label: "Completed",       desc: "PACE has been finished and scored"  },
                    { color: "bg-orange-500", label: "Ongoing",         desc: "PACE is currently in progress"      },
                    { color: "bg-slate-300",  label: "Not Yet Started", desc: "PACE has not been started"           },
                  ].map(({ color, label, desc }) => (
                    <div key={label} className="flex items-start gap-3">
                      <span className={`w-3 h-3 rounded-full ${color} mt-0.5 shrink-0`} />
                      <div>
                        <p className="text-xs font-extrabold text-on-surface">{label}</p>
                        <p className="text-[11px] text-on-surface-variant">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Attendance Summary ────────────────────────────────────────── */}
          <div className="px-6 pb-4">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface mb-3">Attendance Summary</p>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map((i) => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AttendanceCard icon="check_circle" iconBg="bg-green-500"  label="Present"      value={attendance?.present ?? 0} bg="bg-green-50 border border-green-100 rounded-2xl"   />
                <AttendanceCard icon="cancel"        iconBg="bg-red-500"    label="Absent"       value={attendance?.absent  ?? 0} bg="bg-red-50 border border-red-100 rounded-2xl"     />
                <AttendanceCard icon="schedule"      iconBg="bg-orange-500" label="Tardy / Late" value={attendance?.tardy   ?? 0} bg="bg-orange-50 border border-orange-100 rounded-2xl" />
              </div>
            )}
          </div>

          {/* ── PACEs Brought Home + 100s Achieved ───────────────────────── */}
          <div className="px-6 pb-6 grid grid-cols-12 gap-5">
            {loading ? (
              <>
                <SkeletonBlock className="col-span-12 md:col-span-4 h-48 rounded-2xl" />
                <SkeletonBlock className="col-span-12 md:col-span-4 h-48 rounded-2xl" />
              </>
            ) : (
              <>
                <ListSection
                  title="PACEs Brought Home"
                  icon={<span className="material-symbols-outlined text-green-600 text-base" style={fillStyle}>home</span>}
                  iconBg="bg-green-100"
                  count={boughtHome.length}
                  rows={boughtHome}
                  col1Label="PACE"
                  col2Label="Date Brought Home"
                  col1Key="pace_code"
                  col2Key="date"
                />
                <ListSection
                  title="100s Achieved"
                  icon={<span className="text-white text-xs font-extrabold">100</span>}
                  iconBg="bg-blue-600 rounded-full"
                  count={hundreds.length}
                  rows={hundreds}
                  col1Label="PACE"
                  col2Label="Date Achieved 100"
                  col1Key="pace_code"
                  col2Key="date"
                />
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
