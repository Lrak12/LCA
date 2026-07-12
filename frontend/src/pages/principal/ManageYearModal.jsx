// Manage Academic Year modal (principal): edit the active school year's label + start/end
// dates and lay out its quarters. Opened from AcademicConfiguration's "Manage Year".
// Backend chain (frontend api/settings.js updateSchoolYear -> routes/settings.routes.js):
//   PUT /settings/academic/school-year -> controllers/settings.controller.js > updateSchoolYear (~line 10)
//                                      -> services/settings.service.js > updateSchoolYear (~line 100)
import { useState } from "react";
import { updateSchoolYear } from "../../api/settings.js";

const inputClass = "w-full bg-surface-container-low rounded-lg px-4 py-3 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 outline-none border-none";
const labelClass = "block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2";

// starting quarter rows (editable in the modal)
const defaultQuarters = [
  { id: 1, label: "1st Quarter", start: "", end: "" },
  { id: 2, label: "2nd Quarter", start: "", end: "" },
  { id: 3, label: "3rd Quarter", start: "", end: "" },
  { id: 4, label: "4th Quarter", start: "", end: "" },
];

export default function ManageYearModal({ schoolYear, onClose, onSuccess }) {
  const [yearLabel,  setYearLabel]  = useState(schoolYear?.year_label  ?? ""); // seeded from the active year
  const [startDate,  setStartDate]  = useState(schoolYear?.start_date  ?? "");
  const [endDate,    setEndDate]    = useState(schoolYear?.end_date    ?? "");
  const [quarters,   setQuarters]   = useState(defaultQuarters);
  const [editingIdx, setEditingIdx] = useState(null);  // which quarter row is being edited
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  // edit one field of one quarter row
  const updateQuarter = (idx, key, val) => {
    setQuarters((prev) => prev.map((q, i) => i === idx ? { ...q, [key]: val } : q));
  };

  // remove a quarter row
  const deleteQuarter = (idx) => {
    setQuarters((prev) => prev.filter((_, i) => i !== idx));
  };

  // append a new quarter row (auto-labelled) and open it for editing
  const addQuarter = () => {
    const next = quarters.length + 1;
    setQuarters((prev) => [
      ...prev,
      { id: Date.now(), label: `${next}${next === 2 ? "nd" : next === 3 ? "rd" : "th"} Quarter`, start: "", end: "" },
    ]);
    setEditingIdx(quarters.length);
  };

  // validate + save the school-year label and dates
  const handleSave = async () => {
    if (!yearLabel.trim()) { setError("School year label is required."); return; }
    if (!startDate)        { setError("Start date is required."); return; }
    if (!endDate)          { setError("End date is required."); return; }
    setSaving(true);
    setError("");
    try {
      await updateSchoolYear({
        sy_id:      schoolYear?.sy_id,
        year_label: yearLabel,
        start_date: startDate,
        end_date:   endDate,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-outline-variant/20 flex items-start justify-between">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-primary">Manage Academic Year</h2>
            <p className="text-sm text-on-surface-variant mt-1">Configure the calendar framework and term structures.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">

          {error && (
            <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* General Identity */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-secondary text-base">calendar_month</span>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
                General Identity
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>School Year</label>
                <input
                  className={inputClass}
                  placeholder="e.g. 2025-2026"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start Date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>End Date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Manage Terms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-base">list</span>
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
                  Manage Terms
                </p>
              </div>
              <button
                onClick={addQuarter}
                className="text-secondary text-xs font-extrabold hover:underline flex items-center gap-1"
              >
                + Add Term
              </button>
            </div>

            <div className="space-y-3">
              {quarters.map((q, idx) => (
                <div key={q.id}>
                  {editingIdx === idx ? (
                    /* Edit mode */
                    <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
                      <input
                        className={inputClass}
                        placeholder="Term label e.g. 1st Quarter"
                        value={q.label}
                        onChange={(e) => updateQuarter(idx, "label", e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Start</label>
                          <input
                            type="date"
                            className={inputClass}
                            value={q.start}
                            onChange={(e) => updateQuarter(idx, "start", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>End</label>
                          <input
                            type="date"
                            className={inputClass}
                            value={q.end}
                            onChange={(e) => updateQuarter(idx, "end", e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingIdx(null)}
                        className="text-primary text-xs font-extrabold hover:underline"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-extrabold flex items-center justify-center">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-on-surface">{q.label}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {q.start && q.end ? `${q.start} – ${q.end}` : "No dates set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingIdx(idx)}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button
                          onClick={() => deleteQuarter(idx)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-variant hover:text-red-500 transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add another term -> addQuarter() appends a quarter row */}
            <button
              onClick={addQuarter}
              className="mt-3 w-full border-2 border-dashed border-outline-variant/40 rounded-xl py-3 text-sm font-bold text-on-surface-variant hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">add_circle</span>
              Add Another Term
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Cancel
          </button>
          {/* Save -> handleSave() (updateSchoolYear, then onSuccess/onClose) */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving
              ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Saving...</>
              : <><span className="material-symbols-outlined text-base">save</span> Save Changes</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}