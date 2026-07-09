import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import AssignManagePaceModal from "./AssignManagePaceModal.jsx";
import {
  fetchTeacherPaceMonitoring,
  updatePaceCell,
  updatePaceCellStatus,
  assignStudentPace,
} from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatShortDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ─── Subjects (must match backend PACE_SUBJECT_ORDER) ─────────────────────────
const SUBJECTS = [
  { key: "english",  label: "English" },
  { key: "math",     label: "Mathematics" },
  { key: "science",  label: "Science" },
  { key: "word",     label: "Word Building" },
  { key: "fil",      label: "Filipino" },
  { key: "sibika",   label: "Sibika at Kultura / HKS" },
  { key: "lit",      label: "Literature and Creative Writing" },
];

// Full subject labels matching backend PACE_SUBJECT_ORDER
const SUBJECT_LABELS = [
  "English",
  "Mathematics",
  "Science",
  "Word Building",
  "Filipino",
  "Sibika at Kultura/Heograpiya Kasaysayan at Sibika",
  "Literature and Creative Writing",
];

const QUARTER_KEYS   = ["Q1", "Q2", "Q3", "Q4"];
const QUARTER_LABELS = { Q1: "1st Quarter", Q2: "2nd Quarter", Q3: "3rd Quarter", Q4: "4th Quarter" };
const DEFAULT_COUNT  = 6;

// Auto-project Q2–Q4 from Q1 per-subject data
function buildAutoProjectPaces(q1Data) {
  const paces = {};
  SUBJECT_LABELS.forEach((label) => {
    const start = Number(q1Data[label]?.start);
    const count = Number(q1Data[label]?.count) || DEFAULT_COUNT;
    if (!start || isNaN(start) || start <= 0) return;
    paces[label] = {};
    let cursor = start;
    for (let q = 1; q <= 4; q++) {
      paces[label][String(q)] = { start: cursor, count };
      cursor += count;
    }
  });
  return paces;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "completed",   icon: "check_circle", color: "text-green-500",  fill: true,  label: "Completed"       },
  { value: "ongoing",     icon: "pending",      color: "text-orange-400", fill: true,  label: "Ongoing"         },
  { value: "not-started", icon: "circle",       color: "text-slate-300",  fill: false, label: "Not Yet Started" },
  { value: "taken-home",  icon: "home",         color: "text-orange-400", fill: true,  label: "Taken Home"      },
  { value: "needs-next",  icon: "warning",      color: "text-amber-500",  fill: false, label: "Needs next PACE" },
];

// ─── Status Indicator ─────────────────────────────────────────────────────────
const StatusIndicator = ({ status, onClick }) => {
  const cfg = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[2];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="shrink-0 leading-none flex items-center justify-center hover:scale-125 transition-transform"
      title={cfg.label}
    >
      <span
        className={`material-symbols-outlined ${cfg.color}`}
        style={{ ...(cfg.fill ? fillStyle : {}), fontSize: 13 }}
      >
        {cfg.icon}
      </span>
    </button>
  );
};

// ─── PACE Cell ────────────────────────────────────────────────────────────────
// `editable` (Individual View only) turns the PACE number into an inline input
// on click; committing calls onCommit(newNumber).
const PaceCell = ({ pace, compact = false, editable = false, onCommit, onStatusClick }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const startEdit = () => {
    if (!editable) return;
    setVal(pace.num !== "—" ? String(pace.num) : "");
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n !== pace.num) onCommit?.(n);
  };

  return (
    <td className={`${compact ? "px-1 py-1.5" : "px-1 py-2"} text-center border-r border-slate-100 last:border-0`}>
      <div className="flex items-center justify-center gap-0.5 flex-nowrap">
        {editing ? (
          <input
            type="number"
            min="1001"
            max="9999"
            value={val}
            autoFocus
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-14 text-center text-[11px] font-bold border border-primary/50 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        ) : (
          <span
            className={`text-[11px] font-bold text-slate-700 whitespace-nowrap ${editable ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
            onClick={startEdit}
            title={editable ? "Click to edit PACE number" : undefined}
          >
            {pace.num !== "—" ? `- ${pace.num}` : "—"}
          </span>
        )}
        <StatusIndicator status={pace.status} onClick={onStatusClick} />
      </div>
    </td>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────
const Legend = () => (
  <div className="flex items-center gap-4 flex-wrap text-[11px] text-on-surface-variant">
    {STATUS_OPTIONS.map((opt) => (
      <span key={opt.value} className="flex items-center gap-1.5">
        <span
          className={`material-symbols-outlined ${opt.color} leading-none`}
          style={{ ...(opt.fill ? fillStyle : {}), fontSize: 13 }}
        >
          {opt.icon}
        </span>
        {opt.label}
      </span>
    ))}
  </div>
);

// ─── Readiness Badge ──────────────────────────────────────────────────────────
const ReadinessBadge = ({ value }) => {
  const styles = {
    Ready:         "bg-green-100 text-green-700",
    "In Progress": "bg-orange-100 text-orange-700",
    "Not Ready":   "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${styles[value] ?? "bg-slate-100 text-slate-500"}`}>
      {value}
    </span>
  );
};

// ─── Loading Spinner ──────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="flex items-center justify-center py-20 gap-3 text-on-surface-variant">
    <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    <span className="text-sm">Loading pace data…</span>
  </div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-12 text-center">
    <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-4 block" style={fillStyle}>assignment</span>
    <p className="text-base font-bold text-on-surface">No PACE data yet</p>
    <p className="text-sm text-on-surface-variant mt-1">
      Assign PACEs to students first using the <strong>Assign PACE</strong> feature.
    </p>
  </div>
);

// ─── Status Picker Modal ──────────────────────────────────────────────────────
function StatusPickerModal({ cell, currentStatus, onSelect, onClose, saving, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-outline-variant/20 p-5 mx-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
              {["1st","2nd","3rd","4th"][cell.quarterNum - 1]} Quarter
            </p>
            <h3 className="text-sm font-extrabold text-on-surface">{cell.subjectLabel}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="flex gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              disabled={saving}
              className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-surface-container-low disabled:opacity-50 ${
                currentStatus === opt.value ? "bg-primary/10 ring-1 ring-primary/30" : ""
              }`}
            >
              <span
                className={`material-symbols-outlined text-2xl ${opt.color}`}
                style={opt.fill ? fillStyle : {}}
              >
                {opt.icon}
              </span>
              <span className="text-[9px] font-bold text-on-surface-variant text-center leading-tight whitespace-nowrap">
                {opt.label}
              </span>
            </button>
          ))}
        </div>

        {saving && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-on-surface-variant">
            <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Saving…
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs text-red-600 font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Assign Initial Modal (Q1 per subject → auto-project Q2–Q4) ──────────────
function AssignInitialModal({ studentName, onSave, onClose, saving, error }) {
  const [q1Data, setQ1Data] = useState(() =>
    Object.fromEntries(SUBJECT_LABELS.map((l) => [l, { start: "", count: String(DEFAULT_COUNT) }]))
  );

  const setField = (label, field, val) =>
    setQ1Data((prev) => ({ ...prev, [label]: { ...prev[label], [field]: val } }));

  const hasAny = SUBJECT_LABELS.some((l) => Number(q1Data[l].start) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-outline-variant/20 w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between mb-5 shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-on-surface">Assign Initial PACE Plan</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Enter Q1 start PACE per subject for <strong>{studentName}</strong>. Q2–Q4 will be auto-projected.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest">
                <th className="px-4 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border border-gray-200">Subject</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border border-gray-200">Q1 Start PACE #</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border border-gray-200">PACEs / Quarter</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border border-gray-200">Projected End (Q4)</th>
              </tr>
            </thead>
            <tbody>
              {SUBJECT_LABELS.map((label) => {
                const start = Number(q1Data[label].start);
                const count = Number(q1Data[label].count) || DEFAULT_COUNT;
                const q4End = start > 0 ? start + count * 4 - 1 : "—";
                return (
                  <tr key={label} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-xs font-bold text-on-surface border border-gray-200 leading-snug">{label}</td>
                    <td className="px-3 py-2 text-center border border-gray-200">
                      <input
                        type="number"
                        min="1001"
                        max="9999"
                        value={q1Data[label].start}
                        onChange={(e) => setField(label, "start", e.target.value)}
                        placeholder="—"
                        className="w-24 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-3 py-2 text-center border border-gray-200">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={q1Data[label].count}
                        onChange={(e) => setField(label, "count", e.target.value)}
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-3 py-2 text-center border border-gray-200 text-xs font-bold text-on-surface-variant">
                      {q4End}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600 font-semibold flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-on-surface-variant hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(buildAutoProjectPaces(q1Data))}
            disabled={saving || !hasAny}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="text-base">✦</span>
            )}
            {saving ? "Saving…" : "Auto-generate & Save Q1–Q4"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Individual View ──────────────────────────────────────────────────────────
function IndividualView({ student, quarters, onPaceEdit, onStatusClick, onAssignClick, onManageClick, onScheduleTest, onViewScheduled }) {
  // onStatusClick(subjectLabel, quarterNum, rowIndex, currentStatus)
  // onPaceEdit(subjectLabel, quarterNum, rowIndex, newNum, count)
  if (!student) return <EmptyState />;

  const hasProjection = quarters.some((q) => q.paces[0].some((p) => p.num !== "—"));

  return (
    <>
      {/* Student Profile Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 mb-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-white text-xl font-extrabold">{student.initials}</span>
          </div>

          {/* Name + plan */}
          <div className="min-w-[180px]">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h3 className="text-xl font-extrabold text-on-surface">{student.name}</h3>
            </div>
            <span className="inline-block bg-green-100 text-green-700 text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full">
              {student.type}
            </span>
            <p className="text-xs text-on-surface-variant mt-3 leading-snug">
              Projected PACE Plan<br />
              <span className="font-semibold text-on-surface">Generated {formatShortDate(student.planGenerated)}</span>
            </p>
          </div>

          {/* Status + grade + SY */}
          <div className="min-w-[160px] pt-1">
            <span className={`inline-block text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${
              student.paceTestStatus === "PACE Test Ready" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
            }`}>
              {student.paceTestStatus}
            </span>
            <p className="text-sm text-on-surface-variant mt-3">
              Grade Level: <strong className="text-on-surface">{student.gradeLevel}</strong>
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              School Year: <strong className="text-on-surface">{student.schoolYear}</strong>
            </p>
          </div>

          {/* Stat cards */}
          <div className="flex gap-4 flex-wrap ml-auto">
            <div className="bg-green-50 rounded-xl px-5 py-3 text-center min-w-[110px]">
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-green-700/70 mb-1">Completed PACEs</p>
              <p className="text-3xl font-extrabold text-green-600">{student.completedPaces}</p>
            </div>
            <div className="bg-blue-50 rounded-xl px-5 py-3 text-center min-w-[110px]">
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-blue-700/70 mb-1">Remaining PACEs</p>
              <p className="text-3xl font-extrabold text-blue-600">{student.remainingPaces}</p>
            </div>
            <div className="bg-purple-50 rounded-xl px-5 py-3 text-center min-w-[140px]">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="material-symbols-outlined text-purple-500" style={{ ...fillStyle, fontSize: 14 }}>home</span>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-purple-700/70">PACEs Taken Home</p>
              </div>
              <p className="text-3xl font-extrabold text-purple-600">{student.homeworkTakenHome}</p>
            </div>
          </div>
        </div>

        {/* Schedule PACE Test actions */}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onScheduleTest}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1b2e] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <span className="material-symbols-outlined text-base" style={fillStyle}>calendar_month</span>
            Schedule PACE Test
          </button>
          <button onClick={onViewScheduled}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1b2e] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <span className="material-symbols-outlined text-base" style={fillStyle}>event_note</span>
            View Scheduled PACE Test
          </button>
        </div>
      </div>

      {/* No projection banner */}
      {!hasProjection && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500 text-xl" style={fillStyle}>info</span>
            <p className="text-sm font-semibold text-amber-800">
              No PACE plan assigned yet for this student.
            </p>
          </div>
          <button
            onClick={onAssignClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1b2e] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <span className="text-sm">✦</span>
            Assign Initial Paces
          </button>
        </div>
      )}

      {/* PACE Monitoring Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">
              Projected PACE Monitoring
            </h3>
            {hasProjection && (
              <span className="text-[10px] text-on-surface-variant italic">Click any PACE number to edit it</span>
            )}
          </div>
          <Legend />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                <th className="px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant whitespace-nowrap w-28 border-r border-slate-100">
                  Quarter
                </th>
                {SUBJECTS.map((s) => (
                  <th key={s.key} className="px-2 py-3 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-r border-slate-100 last:border-0">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quarters.map((quarter) =>
                quarter.paces.map((paceRow, ri) => (
                  <tr key={`${quarter.label}-${ri}`} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40 transition-colors">
                    {ri === 0 && (
                      <td rowSpan={3} className="px-4 py-3 text-[11px] font-extrabold text-on-surface-variant border-r border-slate-100 whitespace-nowrap align-middle">
                        {quarter.label}
                      </td>
                    )}
                    {paceRow.map((pace, si) => (
                      <PaceCell
                        key={si}
                        pace={pace}
                        editable
                        onCommit={(newNum) =>
                          onPaceEdit(
                            SUBJECT_LABELS[si],
                            quarter.num,
                            ri,
                            newNum,
                            quarter.paces[0][si]?.count ?? DEFAULT_COUNT,
                          )
                        }
                        onStatusClick={() => onStatusClick(SUBJECT_LABELS[si], quarter.num, ri, pace.status)}
                      />
                    ))}
                  </tr>
                ))
              )}
              {/* Ready for Next PACE footer */}
              {quarters.length > 0 && (
                <tr className="bg-surface-container-lowest border-t-2 border-outline-variant/30">
                  <td className="px-4 py-3 text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant leading-snug border-r border-slate-100">
                    Ready for<br />Next PACE<br />(Per Subject)
                  </td>
                  {(quarters[0].readiness ?? []).map((rs, i) => (
                    <td key={i} className="px-1 py-3 text-center border-r border-slate-100 last:border-0">
                      {rs.label === "Yes" ? (
                        <span className="bg-green-100 text-green-700 text-[10px] font-extrabold px-2 py-1 rounded-full">Yes</span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="bg-orange-100 text-orange-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">In Progress</span>
                          {rs.pct !== null && rs.pct > 0 && (
                            <span className="text-[10px] font-bold text-on-surface-variant">{rs.pct}%</span>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-sm shrink-0" style={fillStyle}>info</span>
            Click the house icon to mark a PACE as taken home for homework.
          </div>
          <button onClick={onManageClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1b2e] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <span className="material-symbols-outlined text-base">add</span>
            Assign/Manage Student PACE
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Class View ───────────────────────────────────────────────────────────────
function ClassView({ students, quarter }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? students : students.slice(0, 4);

  if (!students.length) return <EmptyState />;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 flex-wrap gap-3">
        <h3 className="font-headline text-sm font-extrabold text-primary uppercase tracking-widest">
          CLASS VIEW (All Students)
        </h3>
        <Legend />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
              <th className="px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant whitespace-nowrap border-r border-slate-100 min-w-[130px]">
                Student Name
              </th>
              {SUBJECTS.map((s) => (
                <th key={s.key} className="px-2 py-3 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-r border-slate-100">
                  {s.label}
                </th>
              ))}
              <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant whitespace-nowrap min-w-[110px] leading-tight">
                Proceed to<br />Next PACE<br /><span className="text-[9px] font-semibold normal-case tracking-normal">(Overall Readiness)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((student) => {
              const qData = student.quarters[quarter] ?? { readiness: "Not Ready", rows: [] };
              return (qData.rows).map((paceRow, ri) => (
                <tr key={`${student.student_id}-${ri}`} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40 transition-colors">
                  {ri === 0 && (
                    <td rowSpan={3} className="px-4 py-3 text-[12px] font-extrabold text-on-surface border-r border-slate-100 align-middle whitespace-nowrap">
                      {student.name}
                    </td>
                  )}
                  {paceRow.map((pace, si) => <PaceCell key={si} pace={pace} compact />)}
                  {ri === 0 && (
                    <td rowSpan={3} className="px-3 py-3 text-center align-middle border-l border-slate-100">
                      <ReadinessBadge value={qData.readiness} />
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {!showAll && students.length > 4 && (
        <div className="flex justify-center py-4 border-t border-outline-variant/10">
          <button onClick={() => setShowAll(true)} className="flex items-center gap-2 text-sm font-bold text-on-surface hover:text-primary transition-colors px-4 py-2 rounded-lg hover:bg-surface-container-low">
            View More Students ({students.length - 4} more)
            <span className="material-symbols-outlined text-base">expand_more</span>
          </button>
        </div>
      )}
      {showAll && (
        <div className="flex justify-center py-4 border-t border-outline-variant/10">
          <button onClick={() => setShowAll(false)} className="flex items-center gap-2 text-sm font-bold text-on-surface hover:text-primary transition-colors px-4 py-2 rounded-lg hover:bg-surface-container-low">
            Show Less
            <span className="material-symbols-outlined text-base">expand_less</span>
          </button>
        </div>
      )}

      <div className="px-6 py-3 border-t border-outline-variant/10 flex items-center gap-2 text-[11px] text-on-surface-variant">
        <span className="material-symbols-outlined text-sm shrink-0" style={fillStyle}>info</span>
        Readiness is derived from the quarterly PACE projection plan for each student.
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaceMonitoring() {
  const schoolYearLabel = useSchoolYear();
  const navigate = useNavigate();

  const [view,              setView]              = useState("individual");
  const [quarter,           setQuarter]           = useState("Q1");
  const [search,            setSearch]            = useState("");
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState("");
  const [paceData,          setPaceData]          = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [refreshKey,        setRefreshKey]        = useState(0);

  // Status picker modal
  const [statusCell,   setStatusCell]   = useState(null); // { subjectLabel, quarterNum, currentStatus }
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError,  setStatusError]  = useState("");

  // Assign initial modal
  const [assignOpen,   setAssignOpen]   = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError,  setAssignError]  = useState("");

  // Assign / Manage Student PACE modal
  const [manageOpen,   setManageOpen]   = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadData = useCallback((studentId) => {
    setLoading(true);
    setError("");
    const params = studentId ? { student_id: studentId } : {};
    fetchTeacherPaceMonitoring(params)
      .then((res) => {
        const d = res.data ?? {};
        setPaceData(d);
        if (!studentId && d.students?.length) {
          setSelectedStudentId(d.students[0].student_id);
        }
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load pace data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData(selectedStudentId);
  }, [selectedStudentId, refreshKey, loadData]);

  // ── Open status picker ────────────────────────────────────────────────────
  const handleStatusClick = (subjectLabel, quarterNum, rowIndex, currentStatus) => {
    setStatusCell({ subjectLabel, quarterNum, rowIndex, currentStatus });
    setStatusError("");
  };

  // ── Save status ───────────────────────────────────────────────────────────
  const handleSaveStatus = async (newStatus) => {
    if (!statusCell || !selectedStudentId) return;
    setStatusSaving(true);
    setStatusError("");
    try {
      await updatePaceCellStatus({
        student_id: selectedStudentId,
        subject:    statusCell.subjectLabel,
        quarter:    statusCell.quarterNum,
        row_index:  statusCell.rowIndex,
        status:     newStatus,
      });
      setStatusCell(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setStatusError(err.response?.data?.message ?? err.message ?? "Failed to save status.");
    } finally {
      setStatusSaving(false);
    }
  };

  // ── Inline-edit a PACE number ──────────────────────────────────────────────
  // The grid stays consecutive from a single pace_start, so editing the number
  // in row `rowIndex` re-bases the quarter so that cell shows the typed number.
  const handlePaceEdit = async (subjectLabel, quarterNum, rowIndex, newNum, count) => {
    if (!selectedStudentId) return;
    const newStart = newNum - rowIndex;
    if (newStart <= 0) {
      setError("That PACE number is too low for this row.");
      return;
    }
    setError("");
    try {
      await updatePaceCell({
        student_id: selectedStudentId,
        subject:    subjectLabel,
        quarter:    quarterNum,
        pace_start: newStart,
        pace_count: count || DEFAULT_COUNT,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to update PACE number.");
    }
  };

  // ── Save initial assignment (Q1 → auto Q2–Q4) ─────────────────────────────
  const handleAssignInitial = async (paces) => {
    if (!selectedStudentId) return;
    if (!Object.keys(paces).length) {
      setAssignError("Enter at least one subject's Q1 start PACE.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    try {
      await assignStudentPace(selectedStudentId, paces);
      setAssignOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setAssignError(err.response?.data?.message ?? err.message ?? "Failed to save.");
    } finally {
      setAssignSaving(false);
    }
  };

  const classStudents = (paceData?.classView ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const studentList = paceData?.students ?? [];

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              PACE MONITORING
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-xl">
              Monitor student pacing progress, PACE completion status, and readiness for advancement.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Returning Student Placement ─────────────────────────────── */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => navigate("/teacher/pace/returning-placement")}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1b2e] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap shadow-sm"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Returning Student PACE Placement
          </button>
        </div>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Controls ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">

          {view === "individual" && (
            <div className="relative shrink-0 min-w-[220px]">
              <span className="material-symbols-outlined absolute left-3 inset-y-0 flex items-center text-on-surface-variant text-base"style={fillStyle}>person</span>
              <select value={selectedStudentId ?? ""} onChange={(e) => setSelectedStudentId(e.target.value ? parseInt(e.target.value, 10) : null)} disabled={loading || !studentList.length} 
                className="w-full pl-9 pr-10 py-2.5 text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer shadow-sm disabled:opacity-60"
                style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none"}}
              >
                {studentList.length === 0
                  ? <option value="">No students found</option>
                  : studentList.map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.name} {s.gradeLevel ? `(${s.gradeLevel})` : ""}
                    </option>
                  ))
                }
              </select>
            </div>
          )}

          {view === "class" && (
            <div className="relative flex-1 min-w-[200px]">
              <span className="material-symbols-outlined absolute left-3 inset-y-0 flex items-center text-on-surface-variant text-base">search</span>{/* fix for icon alignment*/}
              <input
                type="text"
                placeholder="Search student name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
              />
            </div>
          )}

          <div className="relative shrink-0">
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              {QUARTER_KEYS.map((q) => (
                <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
              ))}
            </select>
          </div>

          <div className="flex rounded-xl overflow-hidden border border-outline-variant/20 shadow-sm shrink-0">
            {["individual", "class"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
                  view === v ? "bg-primary text-white" : "bg-white text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {v === "individual" ? "Individual View" : "Class View"}
              </button>
            ))}
          </div>
        </div>

        {/* ── View Content ─────────────────────────────────────────────── */}
        {loading ? (
          <Spinner />
        ) : view === "individual" ? (
          <IndividualView
            student={paceData?.individual ?? null}
            quarters={paceData?.individual?.quarters ?? []}
            onPaceEdit={handlePaceEdit}
            onStatusClick={handleStatusClick}
            onAssignClick={() => { setAssignError(""); setAssignOpen(true); }}
            onManageClick={() => setManageOpen(true)}
            onScheduleTest={() => navigate("/teacher/pace/schedule-test")}
            onViewScheduled={() => navigate("/teacher/pace/scheduled-tests")}
          />
        ) : (
          <ClassView students={classStudents} quarter={quarter} />
        )}

      </main>

      {/* ── Status Picker Modal ──────────────────────────────────────── */}
      {statusCell && (
        <StatusPickerModal
          cell={statusCell}
          currentStatus={statusCell.currentStatus}
          onSelect={handleSaveStatus}
          onClose={() => setStatusCell(null)}
          saving={statusSaving}
          error={statusError}
        />
      )}

      {/* ── Assign Initial Modal ──────────────────────────────────────── */}
      {assignOpen && (
        <AssignInitialModal
          studentName={paceData?.individual?.name ?? "Student"}
          onSave={handleAssignInitial}
          onClose={() => setAssignOpen(false)}
          saving={assignSaving}
          error={assignError}
        />
      )}

      {/* ── Assign / Manage Student PACE Modal ─────────────────────────── */}
      {manageOpen && selectedStudentId && (
        <AssignManagePaceModal
          studentId={selectedStudentId}
          onClose={() => setManageOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

    </TeacherLayout>
  );
}
