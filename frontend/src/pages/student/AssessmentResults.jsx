import { useState, useEffect, useMemo } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentAssessments } from "../../api/student.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ─── Subject icon styles ──────────────────────────────────────────────────────
const subjectStyles = {
  Mathematics: { bg: "bg-blue-100",  text: "text-blue-600",  icon: "calculate"    },
  English:     { bg: "bg-rose-100",  text: "text-rose-600",  icon: "menu_book"    },
  Science:     { bg: "bg-green-100", text: "text-green-600", icon: "science"      },
  default:     { bg: "bg-amber-100", text: "text-amber-600", icon: "auto_stories" },
};

const subjectStyle = (subject) => subjectStyles[subject] ?? subjectStyles.default;

const TH = ({ children }) => (
  <th className="text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant pb-3 text-left">
    {children}
  </th>
);

const PassBadge = ({ passed }) => (
  <span className={`text-[13px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full ${passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
    {passed ? "Passed" : "Failed"}
  </span>
);

const PaceBadge = ({ number }) =>
  number != null ? (
    <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md whitespace-nowrap">
      PACE {number}
    </span>
  ) : (
    <span className="text-sm text-on-surface-variant">—</span>
  );

const scoreColor = (score) =>
  score >= 90 ? "text-green-600" : score >= 75 ? "text-amber-600" : "text-red-500";

// ─── Reusable section card ────────────────────────────────────────────────────
const SectionCard = ({ title, icon, loading, skeletonRows = 3, children }) => (
  <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 mb-6">
    <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-outline-variant/10">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>{icon}</span>
        )}
        <h3 className="font-headline text-xl font-extrabold text-primary">{title}</h3>
      </div>
      <button className="text-sm font-bold text-primary hover:underline">View All</button>
    </div>
    <div className="px-7 py-5">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  </article>
);

// ─── Results table ─────────────────────────────────────────────────────────────
const ResultsTable = ({ rows }) => {
  if (!rows.length) {
    return <p className="text-sm text-on-surface-variant py-6 text-center">No results match the selected filters.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-outline-variant/20">
            <TH>Subject</TH>
            <TH>Pace Number</TH>
            <TH>Date Taken</TH>
            <TH>Score</TH>
            <TH>Status</TH>
            <TH>Remarks</TH>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {rows.map((r, i) => {
            const style = subjectStyle(r.subject);
            return (
              <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                <td className="py-4 pr-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                      <span className={`material-symbols-outlined text-base ${style.text}`} style={fillStyle}>
                        {style.icon}
                      </span>
                    </div>
                    <span className="text-sm font-extrabold text-on-surface whitespace-nowrap">{r.subject}</span>
                  </div>
                </td>
                <td className="py-4 pr-6">
                  <PaceBadge number={r.paceNumber} />
                </td>
                <td className="py-4 pr-6">
                  <span className="text-sm text-on-surface-variant whitespace-nowrap">{r.dateTaken}</span>
                </td>
                <td className="py-4 pr-6">
                  <span className={`text-sm font-extrabold ${scoreColor(r.score)}`}>{r.score}%</span>
                </td>
                <td className="py-4 pr-6">
                  <PassBadge passed={r.passed} />
                </td>
                <td className="py-4">
                  <span className="text-sm text-on-surface-variant">{r.remarks ?? "—"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Filter controls ───────────────────────────────────────────────────────────
const FilterSelect = ({ label, value, onChange, options, formatOption }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-xl px-3 py-2.5 h-[42px] focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{formatOption ? formatOption(opt) : opt}</option>
      ))}
    </select>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AssessmentResults() {
  const schoolYearLabel       = useSchoolYear();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [schoolYearId, setSchoolYearId] = useState(null);

  useEffect(() => {
    fetchStudentAssessments(schoolYearId)
      .then((res) => {
        setData(res.data);
        if (schoolYearId == null && res.data?.schoolYearId != null) {
          setSchoolYearId(res.data.schoolYearId);
        }
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, [schoolYearId]);

  const selfTestResults = data?.selfTestResults ?? [];
  const paceTestResults = data?.paceTestResults ?? [];
  const schoolYears = data?.schoolYears ?? [];

  // ── Filters ───────────────────────────────────────────────────────────────
  const [quarterFilter, setQuarterFilter] = useState("All Quarters");
  const [paceFilter,    setPaceFilter]    = useState("All PACE");
  const [subjectFilter, setSubjectFilter] = useState("All Subjects");

  const allResults = useMemo(
    () => [...selfTestResults, ...paceTestResults],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  );

  const subjectOptions = useMemo(() => {
    const set = new Set(allResults.map((r) => r.subject).filter(Boolean));
    return ["All Subjects", ...[...set].sort()];
  }, [allResults]);

  const paceOptions = useMemo(() => {
    const set = new Set(allResults.map((r) => r.paceNumber).filter((n) => n != null));
    return ["All PACE", ...[...set].sort((a, b) => a - b).map(String)];
  }, [allResults]);

  const matchesFilters = (r) => {
    if (quarterFilter !== "All Quarters" && Number(r.quarter) !== Number(quarterFilter)) return false;
    if (subjectFilter !== "All Subjects" && r.subject !== subjectFilter) return false;
    if (paceFilter !== "All PACE" && String(r.paceNumber) !== paceFilter) return false;
    return true;
  };

  const filteredSelfTests = selfTestResults.filter(matchesFilters);
  const filteredPaceTests = paceTestResults.filter(matchesFilters);

  const handleSchoolYearChange = (value) => {
    setLoading(true);
    setError("");
    setSchoolYearId(Number(value));
    setQuarterFilter("All Quarters");
    setPaceFilter("All PACE");
    setSubjectFilter("All Subjects");
  };

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
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
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              Assessment Results
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-lg">
              Track your latest scores, review detailed performance metrics, and see
              how you're doing overall.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Filters ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">School Year</label>
              <select
                value={schoolYearId ?? data?.schoolYearId ?? ""}
                onChange={(event) => handleSchoolYearChange(event.target.value)}
                disabled={loading || schoolYears.length === 0}
                className="text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-xl px-3 py-2.5 h-[42px] focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
              >
                {schoolYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}{year.isActive ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <FilterSelect
              label="Quarter"
              value={quarterFilter}
              onChange={setQuarterFilter}
              options={["All Quarters", "1", "2", "3", "4"]}
              formatOption={(opt) => (opt === "All Quarters" ? opt : `Quarter ${opt}`)}
            />
            <FilterSelect
              label="Pace Number"
              value={paceFilter}
              onChange={setPaceFilter}
              options={paceOptions}
              formatOption={(opt) => (opt === "All PACE" ? opt : `PACE ${opt}`)}
            />
            <FilterSelect
              label="Subject"
              value={subjectFilter}
              onChange={setSubjectFilter}
              options={subjectOptions}
            />
          </div>
        </div>

        {/* ── Self-Test Results ─────────────────────────────────────── */}
        <SectionCard title="Self-Test Results" icon="edit_note" loading={loading} skeletonRows={3}>
          <ResultsTable rows={filteredSelfTests} />
        </SectionCard>

        {/* ── PACE Test Results ─────────────────────────────────────── */}
        <SectionCard title="PACE Test Results" icon="school" loading={loading} skeletonRows={3}>
          <ResultsTable rows={filteredPaceTests} />
        </SectionCard>

      </main>
    </StudentLayout>
  );
}
