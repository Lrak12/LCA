import { useState } from "react";
import { createDiagnostic, updateDiagnostic } from "../../api/diagnosticAssessments.js";

const PACE_ROWS = [
  { page: 1,  range: "1001 – 1012", min: 5  },
  { page: 2,  range: "1013 – 1024", min: 5  },
  { page: 3,  range: "1025 – 1036", min: 4  },
  { page: 4,  range: "1037 – 1048", min: 5  },
  { page: 6,  range: "1049 – 1060", min: 6  },
  { page: 7,  range: "1061 – 1072", min: 6  },
  { page: 8,  range: "1073 – 1084", min: 8  },
  { page: 10, range: "1085 – 1096", min: 18 },
];

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

export default function SocialScienceDiagnosticModal({ subject, student, existing, onClose, onSaved }) {
  const [scores,    setScores]    = useState(() => Object.fromEntries(PACE_ROWS.map((r) => [r.page, ""])));
  const [startPace, setStartPace] = useState(existing?.start_pace != null ? String(existing.start_pace) : "");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const setScore = (page, val) => setScores((prev) => ({ ...prev, [page]: val }));

  const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const handleSave = async () => {
    if (!startPace.trim()) {
      setError("Please enter the PACE number the student is ready to advance from.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        student_id: student.student_id,
        test_date:  new Date().toISOString().split("T")[0],
        start_pace: startPace,
        score:      totalScore,
        subject,
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
          <h2 className="text-white font-bold text-lg tracking-widest uppercase">{subject}</h2>
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
              <div className="grid grid-cols-2 divide-x divide-outline-variant border-b border-outline-variant">
                {[
                  { label: "LAST NAME",   value: student.last_name   ?? "", placeholder: "e.g., Dela Cruz" },
                  { label: "FIRST NAME",  value: student.first_name  ?? "", placeholder: "e.g., Juan"      },
                ].map(({ label, value, placeholder }) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm text-on-surface font-medium">
                      {value || <span className="text-on-surface-variant/40">{placeholder}</span>}
                    </p>
                  </div>
                ))}
              </div>
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
                  <p className="text-sm text-on-surface font-medium">{student.grade_level?.level_name ?? "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Supervisor Section */}
          <div className="border border-outline-variant rounded-xl overflow-hidden">
            <div className="bg-surface-container-low px-6 py-3 border-b border-outline-variant text-center">
              <p className="font-bold text-primary tracking-widest uppercase text-sm">For Supervisor's Use Only</p>
            </div>

            <div className="p-5 flex gap-6">
              {/* Instructions */}
              <div className="w-44 shrink-0 text-xs text-on-surface-variant leading-relaxed italic">
                <p>
                  Instructions: On the blanks in the box on the right, write the number of correct
                  answers the student was able to give at each level. Minimum numbers are in
                  parentheses.
                </p>
                <p className="mt-3">
                  If a student falls below the minimum number of correct answers at a level,
                  this is the student&apos;s &quot;performance level.&quot; Enter the number of the first
                  PACE of the student&apos;s performance level in the blank labeled &quot;Student
                  Ready to Advance from PACE #_____.&quot;
                </p>
              </div>

              {/* Score Table */}
              <div className="flex-1">
                <table className="w-full border border-outline-variant rounded-lg overflow-hidden text-sm">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="px-3 py-2 text-center text-xs font-bold text-on-surface-variant border-b border-r border-outline-variant w-12">Page</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-on-surface-variant border-b border-r border-outline-variant">Starting PACE No.</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-on-surface-variant border-b border-r border-outline-variant">Student's Score</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-on-surface-variant border-b border-outline-variant w-24">Minimum Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PACE_ROWS.map((row, i) => (
                      <tr key={row.page} className={i < PACE_ROWS.length - 1 ? "border-b border-outline-variant" : ""}>
                        <td className="px-3 py-2.5 text-center font-semibold text-on-surface border-r border-outline-variant">{row.page}</td>
                        <td className="px-3 py-2.5 text-center text-on-surface border-r border-outline-variant">{row.range}</td>
                        <td className="px-3 py-2.5 border-r border-outline-variant">
                          <input
                            type="number"
                            min="0"
                            value={scores[row.page]}
                            onChange={(e) => setScore(row.page, e.target.value)}
                            className="w-full border-b border-outline-variant bg-transparent text-center text-sm text-on-surface focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center text-on-surface-variant">({row.min})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Score Row */}
            <div className="border-t border-outline-variant px-6 py-3 flex items-center justify-between bg-surface-container-low">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Score</p>
              <p className="text-lg font-extrabold text-primary">{totalScore}</p>
            </div>

            {/* Student Ready to Advance */}
            <div className="border-t border-outline-variant px-6 py-4">
              <p className="text-xs font-bold text-on-surface uppercase tracking-widest mb-3">
                Student Ready to Advance From PACE #
              </p>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant font-bold text-xl">#</span>
                <input
                  type="text"
                  value={startPace}
                  onChange={(e) => setStartPace(e.target.value)}
                  placeholder="0000"
                  maxLength={4}
                  className="w-36 text-center text-4xl font-extrabold font-headline tracking-tight text-primary border-b-2 border-primary bg-transparent focus:outline-none placeholder:text-on-surface-variant/30"
                />
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
