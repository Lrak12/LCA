import { useState, useEffect } from "react";
import {
  fetchAcademicConfig,
  updateSchoolYear,
  createGradeLevel,
  updateGradeLevel,
} from "../../api/settings.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS = {
  ACTIVE:  { label: "Active",  bg: "bg-amber-100", text: "text-amber-700" },
  PENDING: { label: "Pending", bg: "bg-slate-100",  text: "text-slate-500" },
  CLOSED:  { label: "Closed",  bg: "bg-red-50",     text: "text-red-400"   },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS[status] ?? STATUS.PENDING;
  return (
    <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

// ─── Quarter card ─────────────────────────────────────────────────────────────
const QuarterCard = ({ label, status, dateRange }) => {
  const isActive = status === "ACTIVE";
  return (
    <div
      className={`flex-1 min-w-[140px] rounded-xl p-5 border transition-all
        ${isActive
          ? "border-amber-400 bg-white shadow-md shadow-amber-100"
          : "border-outline-variant/30 bg-surface-container-low"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-extrabold uppercase tracking-widest ${isActive ? "text-primary" : "text-on-surface-variant"}`}>
          {label}
        </span>
        <StatusBadge status={status} />
      </div>
      <p className={`text-[11px] font-medium leading-relaxed ${isActive ? "text-on-surface" : "text-on-surface-variant"}`}>
        {dateRange}
      </p>
    </div>
  );
};

// ─── Sections badge ───────────────────────────────────────────────────────────
const SectionsBadge = ({ count }) => (
  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-extrabold">
    {count} {count === 1 ? "Section" : "Sections"}
  </span>
);

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function AcademicConfiguration({
  onManageYear = () => {},
  onAddGrade   = () => {},
  onEditGrade  = () => {},
}) {
  const [schoolYear, setSchoolYear] = useState(null);
  const [quarters, setQuarters]     = useState([]);
  const [grades, setGrades]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    fetchAcademicConfig()
      .then((res) => {
        setSchoolYear(res.data.schoolYear);
        setQuarters(res.data.quarters);
        setGrades(res.data.gradeLevels);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">

      {/* ── Section header ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-1 h-7 rounded-full bg-secondary" />
          <h3 className="font-headline text-xl font-extrabold text-primary">
            Academic Configuration
          </h3>
        </div>
        <p className="text-sm text-on-surface-variant pl-4">
          Manage school years, terms, and grade levels.
        </p>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* ── Active Academic Period ─────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
          Active Academic Period
        </p>

        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-6 py-5 border border-outline-variant/20">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>
                  calendar_month
                </span>
              </div>
              <div>
                <p className="font-extrabold text-on-surface text-base leading-tight">
                  SY {schoolYear?.year_label ?? "—"}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Current active academic year for all operations.
                </p>
              </div>
            </div>
            <button
              onClick={onManageYear}
              className="px-5 py-2.5 rounded-lg border border-outline-variant/40 bg-white text-sm font-bold text-on-surface hover:border-primary hover:text-primary transition-all shadow-sm"
            >
              Manage Year
            </button>
          </div>
        )}
      </div>

      {/* ── Grading Periods ───────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
          Grading Periods (Quarterly)
        </p>

        {loading ? (
          <div className="flex gap-3">
            <Skeleton className="h-24 flex-1" />
            <Skeleton className="h-24 flex-1" />
            <Skeleton className="h-24 flex-1" />
            <Skeleton className="h-24 flex-1" />
          </div>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {quarters.map((q) => (
              <QuarterCard
                key={q.id}
                label={q.label}
                status={q.status}
                dateRange={q.dateRange}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Grade Levels & Sections ───────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
            Grade Levels &amp; Sections
          </p>
          <button
            onClick={onAddGrade}
            className="flex items-center gap-1.5 text-secondary font-bold text-xs hover:underline transition-all"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            Add Grade Level
          </button>
        </div>

        <div className="rounded-xl border border-outline-variant/20 overflow-hidden bg-white shadow-sm">

          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_80px] px-6 py-3 bg-surface-container-low border-b border-outline-variant/10">
            {["Grade Level", "Active Sections", "Action"].map((h) => (
              <span key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
                {h}
              </span>
            ))}
          </div>

          {/* Loading rows */}
          {loading && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-6 py-4 border-b border-outline-variant/10">
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </>
          )}

          {/* Data rows */}
          {!loading && grades.map((gl, idx) => (
            <div
              key={gl.gl_id}
              className={`grid grid-cols-[2fr_1.5fr_80px] px-6 py-4 items-center transition-colors hover:bg-surface-container-low/50
                ${idx !== grades.length - 1 ? "border-b border-outline-variant/10" : ""}`}
            >
              <span className="font-extrabold text-sm text-on-surface">{gl.level_name}</span>
              <SectionsBadge count={gl.sections ?? 0} />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditGrade(gl.gl_id)}
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors"
                  title="Edit grade level"
                >
                  <span className="material-symbols-outlined text-base">edit</span>
                </button>
                <button
                  onClick={() => onEditGrade(gl.gl_id)}
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors"
                  title="Manage sections"
                >
                  <span className="material-symbols-outlined text-base">menu</span>
                </button>
              </div>
            </div>
          ))}

          {/* Empty state */}
          {!loading && grades.length === 0 && (
            <div className="px-6 py-10 text-center text-on-surface-variant text-sm">
              No grade levels configured yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}