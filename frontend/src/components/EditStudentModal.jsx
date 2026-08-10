// Edit Student Information modal (principal): edit a student's demographic fields.
// Opened from StudentSummaryModal ("Edit Information"). Saves via PUT /students/:id.
// Backend chain (frontend api/student.js updateStudentInfo -> routes/student.routes.js):
//   PUT /students/:id -> controllers/student.controller.js > update -> services/student.service.js > updateStudent
import { useState } from "react";
import { updateStudentInfo } from "../api/student.js";
import { isPhMobile, PH_MOBILE_HINT } from "../utils/phone.js";

const inputClass = "w-full border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelClass = "block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2";

// ISO date (YYYY-MM-DD) for the <input type="date"> value, or "" if missing/invalid.
const toDateInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

// `student` = the summary modal's `s` (has first_name, last_name, gender, date_of_birth,
// address, contact_number). onSaved = () => reload the summary + list.
export default function EditStudentModal({ student, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name:     student.first_name ?? "",
    last_name:      student.last_name ?? "",
    gender:         student.gender ?? "",
    date_of_birth:  toDateInput(student.date_of_birth),
    address:        student.address ?? "",
    contact_number: student.contact_number ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required."); return;
    }
    if (!form.date_of_birth) {
      setError("Date of birth is required."); return;
    }
    if (!form.address.trim()) {
      setError("Address is required."); return;
    }
    // Only enforce the PH-mobile format when the contact was actually changed, so a
    // legacy/non-conforming number doesn't block edits to other fields.
    const contactChanged = form.contact_number.trim() !== (student.contact_number ?? "").trim();
    if (contactChanged && form.contact_number.trim() && !isPhMobile(form.contact_number.trim())) {
      setError(PH_MOBILE_HINT); return;
    }
    setSaving(true);
    setError("");
    try {
      await updateStudentInfo(student.student_id, {
        first_name:     form.first_name.trim(),
        last_name:      form.last_name.trim(),
        gender:         form.gender || null,
        date_of_birth:  form.date_of_birth,
        address:        form.address.trim(),
        contact_number: form.contact_number.trim() || null,
      });
      onSaved?.();
    } catch (err) {
      setError(err.message ?? "Failed to update student.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit</span>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Edit Student Information</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>First Name <span className="text-red-500">*</span></label>
              <input value={form.first_name} onChange={set("first_name")} placeholder="e.g., Juan" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Last Name <span className="text-red-500">*</span></label>
              <input value={form.last_name} onChange={set("last_name")} placeholder="e.g., Dela Cruz" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Gender</label>
              <select value={form.gender} onChange={set("gender")} className={inputClass}>
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Address <span className="text-red-500">*</span></label>
              <input value={form.address} onChange={set("address")} placeholder="e.g., Dumaguete City" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Contact Number</label>
              <input value={form.contact_number} onChange={set("contact_number")} placeholder="e.g., 09171234567" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
