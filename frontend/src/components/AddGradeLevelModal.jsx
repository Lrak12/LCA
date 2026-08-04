// Add Grade Level modal — shared by the principal (School Grade Levels page) and
// the admin (System Configuration → School Year Management). Creates a grade level
// for the active school year.
// Backend chain (frontend api/settings.js createGradeLevel -> routes/settings.routes.js):
//   POST /settings/academic/grade-levels -> controllers/settings.controller.js > addGradeLevel
//                                        -> services/settings.service.js > addGradeLevel
import { useState } from "react";
import { createGradeLevel } from "../api/settings.js";

// onSuccess = () => reload the caller's grade-level list. nextOrder pre-fills the
// Level Order field (backend auto-assigns the next slot when it's left blank).
export default function AddGradeLevelModal({ onClose, onSuccess, nextOrder = "" }) {
  const [name,   setName]   = useState("");
  const [order,  setOrder]  = useState(nextOrder === "" ? "" : String(nextOrder));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Grade level name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { level_name: name.trim() };
      if (String(order).trim() !== "") payload.level_order = Number(order);
      await createGradeLevel(payload);
      onSuccess?.();
    } catch (err) {
      setError(err.message ?? "Failed to add grade level.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_circle</span>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Add Grade Level</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}
          <div>
            <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">
              Grade Level Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="e.g., Grade 3"
              className="w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">
              Level Order
            </label>
            <input
              type="number"
              min={1}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              placeholder="Auto (next available)"
              className="w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-[11px] text-on-surface-variant mt-1.5">
              Controls sort order and promotion sequence. Leave blank to place it last.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? "Adding…" : "Add Grade Level"}
          </button>
        </div>
      </div>
    </div>
  );
}
