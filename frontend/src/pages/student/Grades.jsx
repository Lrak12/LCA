import { useState, useEffect } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentGrades } from "../../api/student.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const QUARTER_LABELS = ["1ST QUARTER", "2ND QUARTER", "3RD QUARTER", "4TH QUARTER"];

// Pastel row backgrounds, cycled per subject row.
const ROW_COLORS = [
  "bg-amber-50",  // Mathematics
  "bg-rose-50",   // English
  "bg-yellow-50", // Filipino
  "bg-blue-50",   // Science
  "bg-green-50",  // Araling Panlipunan
  "bg-purple-50", // TLE / Computer
  "bg-orange-50", // MAPEH
  "bg-cyan-50",   // ESP
];

const TH = ({ children, className = "" }) => (
  <th className={`text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 px-3 ${className}`}>
    {children}
  </th>
);

// ─── Academic Standing stat ───────────────────────────────────────────────────
const StandingStat = ({ label, value, sub }) => (
  <div className="flex-1 text-center px-4 py-2">
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">{label}</p>
    <p className="font-headline text-3xl font-extrabold text-primary">{value}</p>
    <p className="text-[11px] text-on-surface-variant mt-1">{sub}</p>
  </div>
);

const remarkColor = (remark) => {
  switch (remark) {
    case "Outstanding":
    case "Very Satisfactory":
    case "Satisfactory":
    case "Fairly Satisfactory":
      return "text-green-700";
    case "Did Not Meet Expectations":
      return "text-red-600";
    default:
      return "text-on-surface-variant";
  }
};

export default function Grades() {
  const schoolYearLabel        = useSchoolYear();
  const [data, setData]        = useState(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState("");
  const [quarter, setQuarter]  = useState(1);

  useEffect(() => {
    fetchStudentGrades(quarter)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [quarter]);

  const student = data?.student ?? { first_name: "Student", last_name: "", lrn: null };
  const studentName = `${(student.last_name ?? "").toUpperCase()}, ${(student.first_name ?? "").toUpperCase()}`.replace(/^,\s*/, "");

  const gradeLevel = data?.gradeLevel ?? "—";
  const lrn        = student.lrn ?? "—";
  const syLabel    = data?.schoolYear ?? schoolYearLabel ?? "—";

  const subjects = data?.subjects ?? [
    { subject: "Mathematics", paceNumbers: [1097, 1098, 1099], paceScores: [92, 94, 91], quarterAverage: 92, passed: true },
    { subject: "English",     paceNumbers: [1097, 1098, 1099], paceScores: [95, 96, 94], quarterAverage: 95, passed: true },
    { subject: "Science",     paceNumbers: [1097, 1098, 1099], paceScores: [94, 95, 93], quarterAverage: 94, passed: true },
  ];

  const generalAverage     = data?.generalAverage ?? 94;
  const overallRemark      = data?.overallRemark ?? "Outstanding";
  const pacesCompleted     = data?.pacesCompleted ?? 0;
  const pacesTotal         = data?.pacesTotal ?? 0;
  const supervisorComments = data?.supervisorComments ?? "";

  const standing = data?.academicStanding ?? {
    overallAverage: 92, performancePoints: 128, currentRank: 3, completionRankLabel: "Top 5%",
  };
  const bibleMemory = data?.bibleMemory ?? null;
  const readingWpm  = data?.readingWpm ?? null;

  const quarterLabel = QUARTER_LABELS[quarter - 1];

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              Grades
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-lg">
              View your current marks, overall GPA, and specific assessment scores
              to stay on top of your performance.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
              <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">Quarter:</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                className="text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {QUARTER_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* ── Academic Standing ───────────────────────────────────── */}
        <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 mb-6">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>trending_up</span>
            <h3 className="font-headline text-lg font-extrabold text-primary">Academic Standing</h3>
          </div>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-outline-variant/15">
              <StandingStat
                label="Overall Average"
                value={standing.overallAverage != null ? `${standing.overallAverage}%` : "—"}
                sub="Across all subjects"
              />
              <StandingStat
                label="Performance Points"
                value={<>{standing.performancePoints ?? 0}<span className="text-base font-bold"> pts</span></>}
                sub="Total Earned"
              />
              <StandingStat
                label="Current Rank"
                value={standing.currentRank != null ? `#${standing.currentRank}` : "—"}
                sub="In Grade Level"
              />
              <StandingStat
                label="PACE Completion Level Rank"
                value={standing.completionRankLabel ?? "—"}
                sub={standing.completionRankLabel ? `${standing.completionRankLabel} in Grade Level` : "—"}
              />
            </div>
          )}
        </article>

        {/* ── Report Card ─────────────────────────────────────────── */}
        <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-7">

          {/* Student info bar */}
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 pb-5 border-b border-outline-variant/10">
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Student Name</p>
              <p className="text-sm font-extrabold text-on-surface">{studentName || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Grade Level</p>
              <p className="text-sm font-extrabold text-on-surface">{gradeLevel}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">LRN</p>
              <p className="text-sm font-extrabold text-on-surface">{lrn}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">School Year</p>
              <p className="text-sm font-extrabold text-on-surface">{syLabel}</p>
            </div>
          </div>

          {/* Grades table */}
          <div className="pt-5" />
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 px-3 text-left align-bottom border-b border-outline-variant/20">
                      Subject
                    </th>
                    <th colSpan={3} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-2 px-3 text-center border-b border-outline-variant/20">
                      {quarterLabel}
                    </th>
                    <th rowSpan={2} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 px-3 text-center align-bottom border-b border-outline-variant/20">
                      Quarter Average
                    </th>
                    <th rowSpan={2} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 px-3 text-center align-bottom border-b border-outline-variant/20">
                      Remarks
                    </th>
                  </tr>
                  <tr>
                    <TH className="text-center border-b border-outline-variant/20">1st Pace</TH>
                    <TH className="text-center border-b border-outline-variant/20">2nd Pace</TH>
                    <TH className="text-center border-b border-outline-variant/20">3rd Pace</TH>
                  </tr>
                </thead>
                <tbody>
                  {subjects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-on-surface-variant">
                        No PACE projections found for {quarterLabel.toLowerCase()}.
                      </td>
                    </tr>
                  ) : (
                    subjects.map((s, i) => (
                      <tr key={s.subject} className={ROW_COLORS[i % ROW_COLORS.length]}>
                        <td className="py-3 px-3 text-sm font-extrabold text-on-surface uppercase whitespace-nowrap">
                          {s.subject}
                        </td>
                        {s.paceScores.map((score, j) => (
                          <td key={j} className="py-3 px-3 text-sm font-bold text-on-surface text-center">
                            {score ?? "—"}
                          </td>
                        ))}
                        <td className="py-3 px-3 text-sm font-extrabold text-on-surface text-center">
                          {s.quarterAverage ?? "—"}
                        </td>
                        <td className={`py-3 px-3 text-sm font-extrabold text-center ${s.passed == null ? "text-on-surface-variant" : s.passed ? "text-green-700" : "text-red-600"}`}>
                          {s.passed == null ? "—" : s.passed ? "Passed" : "Failed"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {subjects.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-outline-variant/20">
                      <td colSpan={4} className="py-3 px-3 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-right">
                        General Average
                      </td>
                      <td className="py-3 px-3 text-base font-extrabold text-primary text-center">
                        {generalAverage ?? "—"}
                      </td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={4} className="py-3 px-3 text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-right">
                        Remark
                      </td>
                      <td colSpan={2} className={`py-3 px-3 text-sm font-extrabold text-center ${remarkColor(overallRemark)}`}>
                        {overallRemark}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* PACEs completed + Bible Memory + Reading WPM */}
          <div className="mt-5 pt-5 border-t border-outline-variant/10 flex flex-wrap items-center gap-x-10 gap-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-extrabold text-on-surface">Number of PACEs Completed:</p>
              <span className="text-sm font-extrabold text-primary">{pacesCompleted} / {pacesTotal}</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-extrabold text-on-surface">Bible Memory:</p>
              <span className="text-sm font-bold text-on-surface-variant">{bibleMemory ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-extrabold text-on-surface">Reading WPM:</p>
              <span className="text-sm font-bold text-on-surface-variant">{readingWpm ?? "—"}</span>
            </div>
          </div>

          {/* Supervisor comments */}
          <div className="mt-5">
            <p className="text-sm font-extrabold text-on-surface mb-2">Supervisor Comments:</p>
            <div className="border border-outline-variant/20 rounded-xl p-4 min-h-[80px] text-sm text-on-surface-variant">
              {supervisorComments || "No comments yet."}
            </div>
          </div>

        </article>

      </main>
    </StudentLayout>
  );
}
