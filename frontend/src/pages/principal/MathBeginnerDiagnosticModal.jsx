import { useState } from "react";
import { createDiagnostic, updateDiagnostic } from "../../api/diagnosticAssessments.js";

const parseGaps = (raw) =>
  raw ? new Set(String(raw).split(",").map((n) => Number(n.trim())).filter((n) => n > 0)) : new Set();

// Math Beginner PACE numbers: 1001–1048 (12 per row, 4 rows)
const MATH_BEG_PACES = Array.from({ length: 48 }, (_, i) => 1001 + i);
const PACE_ROWS      = Array.from({ length: 4  }, (_, i) => MATH_BEG_PACES.slice(i * 12, i * 12 + 12));

const calcAge = (dob) => {
  if (!dob) return "";
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const formatDOB = (dob) => {
  if (!dob) return "";
  const d = new Date(dob);
  return isNaN(d) ? dob : d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

export default function MathBeginnerDiagnosticModal({ student, existing, onClose, onSaved }) {
  const [gaps,      setGaps]      = useState(() => parseGaps(existing?.learning_gaps));
  const [startPace, setStartPace] = useState(existing?.start_pace != null ? String(existing.start_pace) : "");
  // ACE rule: start PACE auto-fills to the lowest missed PACE, unless overridden.
  const [manual,    setManual]    = useState(existing?.start_pace != null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const toggleGap = (pace) => {
    const next = new Set(gaps);
    next.has(pace) ? next.delete(pace) : next.add(pace);
    setGaps(next);
    if (!manual) setStartPace(next.size ? String(Math.min(...next)) : "");
  };

  const gapsDisplay = gaps.size > 0
    ? [...gaps].sort((a, b) => a - b).join(", ")
    : "";

  const handleSave = async () => {
    if (!startPace.trim()) {
      setError("Please enter the PACE number the student is ready to advance from.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        student_id:    student.student_id,
        test_date:     new Date().toISOString().split("T")[0],
        start_pace:    startPace,
        subject:       "Math Beginner",
        learning_gaps: gaps.size > 0 ? [...gaps].sort((a, b) => a - b).join(",") : null,
      };
      if (existing?.diag_id) await updateDiagnostic(existing.diag_id, payload);
      else                   await createDiagnostic(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="bg-primary px-8 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-white font-bold text-lg tracking-widest uppercase">Record Diagnostic</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-8 py-6 space-y-6">

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* Student Information */}
          <div>
            <p className="text-xs font-bold text-primary tracking-widest uppercase mb-3">Student Information</p>
            <div className="border border-outline-variant rounded-xl overflow-hidden">
              {/* Row 1: Names */}
              <div className="grid grid-cols-2 divide-x divide-outline-variant border-b border-outline-variant">
                {[
                  { label: "LAST NAME",  value: student.last_name,  placeholder: "e.g., Dela Cruz" },
                  { label: "FIRST NAME", value: student.first_name, placeholder: "e.g., Juan"      },
                ].map(({ label, value, placeholder }) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm text-on-surface font-medium">
                      {value ?? <span className="text-on-surface-variant/40">{placeholder}</span>}
                    </p>
                  </div>
                ))}
              </div>
              {/* Row 2: Age / DOB / Grade */}
              <div className="grid grid-cols-3 divide-x divide-outline-variant">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">AGE</p>
                  <p className="text-sm text-on-surface font-medium">
                    {calcAge(student.date_of_birth) || <span className="text-on-surface-variant/40">—</span>}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">BIRTH DATE</p>
                  <p className="text-sm text-on-surface font-medium">
                    {formatDOB(student.date_of_birth) || <span className="text-on-surface-variant/40">mm/dd/yyyy</span>}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">GRADE</p>
                  <p className="text-sm text-on-surface font-medium">
                    {student.grade_level?.level_name ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Supervisor Section */}
          <div className="border border-outline-variant rounded-xl p-5 space-y-4">
            <div className="text-center">
              <p className="font-bold text-primary text-base tracking-widest uppercase">For Supervisor's Use Only</p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-xl mx-auto leading-relaxed">
                Instructions: On the chart below, click the numbers of PACE's where the child scored less than
                minimum in each section. The selected numbers represent &quot;learning gaps&quot; and help determine
                beginning performance level.
              </p>
            </div>

            {/* PACE Grid — 4 rows × 12 cols (1001–1048) */}
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              {PACE_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className={`grid grid-cols-12 ${ri < PACE_ROWS.length - 1 ? "border-b border-outline-variant" : ""}`}
                >
                  {row.map((pace) => {
                    const selected = gaps.has(pace);
                    return (
                      <button
                        key={pace}
                        onClick={() => toggleGap(pace)}
                        className={`py-2 text-xs font-semibold text-center border-r border-outline-variant last:border-r-0 transition-colors ${
                          selected
                            ? "bg-primary text-white"
                            : "hover:bg-primary-fixed hover:text-primary text-on-surface"
                        }`}
                      >
                        {pace}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Learning Gaps + Starting PACE */}
            <div className="grid grid-cols-2 gap-6 items-start">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Learning Gaps: PACE's #
                </p>
                <textarea
                  readOnly
                  value={gapsDisplay}
                  placeholder="Selected PACE gaps will appear here..."
                  rows={3}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-low resize-none text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
                />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Student Ready to Advance From PACE #
                </p>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-on-surface-variant font-bold text-xl">#</span>
                  <input
                    type="text"
                    value={startPace}
                    onChange={(e) => { setManual(true); setStartPace(e.target.value); }}
                    placeholder="0000"
                    maxLength={4}
                    className="w-full text-center text-4xl font-extrabold font-headline tracking-tight text-primary border-b-2 border-primary bg-transparent focus:outline-none placeholder:text-on-surface-variant/30"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-outline-variant flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-bold text-on-surface-variant hover:text-primary uppercase tracking-widest transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Save Record
          </button>
        </div>

      </div>
    </div>
  );
}
