// Diagnostic Assessment Management (principal): enroll a new student for placement
// testing (auto-generates login credentials), list diagnostic-flow students, and jump to
// Record Diagnostic. "Record" navigates to RecordDiagnostic.jsx.
// Backend chain:
//   list diagnostics: GET  /assessments/diagnostic (api/diagnosticAssessments.js fetchDiagnostics)
//        -> controllers/assessment.controller.js > getDiagnostics (~line 43) -> services/assessment.service.js > getAllDiagnostics (~line 14)
//   create student:   POST /students (api/student.js createStudent)
//        -> controllers/student.controller.js > create (~line 15) -> services/student.service.js > createStudent (~line 113)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchDiagnostics } from "../../api/diagnosticAssessments.js";
import { isPhMobile, PH_MOBILE_HINT } from "../../utils/phone.js";
import { createStudent, fetchAllStudents } from "../../api/student.js";
import { fetchAllSections } from "../../api/sections.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import StudentDiagnosticDetailModal from "../../components/StudentDiagnosticDetailModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// Placement Basis — placeholder until a stored field exists. Colors are ready for
// all four values; rows currently default to "Diagnostic Assessment".
const BASIS_STYLES = {
  "Diagnostic Assessment":       "bg-blue-50 text-blue-600",
  "Principal Recommendation":    "bg-green-50 text-green-600",
  "Supervisor Recommendation":   "bg-purple-50 text-purple-600",
  "Historical PACE Performance": "bg-orange-50 text-orange-600",
};
const DEFAULT_BASIS = "Diagnostic Assessment";

// Render a student's name as "Last, First" (falls back to whatever parts exist).
const lastFirst = (s) => {
  const last  = (s.last_name  ?? "").trim();
  const first = (s.first_name ?? "").trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || "—";
};

// Compare two students by "last name, first name" for A→Z / Z→A sorting.
const compareByName = (a, b, dir) =>
  (`${a.last_name ?? ""} ${a.first_name ?? ""}`)
    .localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`, undefined, { sensitivity: "base" }) * dir;

// ─── New Student Modal ────────────────────────────────────────────────────────
// Enroll a brand-new student for diagnostic testing; on success shows an auto-generated
// login-credentials card, then routes into the diagnostic recording flow.
// Rendered by <DiagnosticAssessments> (showModal). onClose = () => setShowModal(false);
// onCreated = handleStudentCreated (navigates to RecordDiagnostic for the new student).
function NewStudentModal({ onClose, onCreated }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "",
    gender: "", gl_id: "", contact_number: "", address: "",
    enrollment_date: todayISO,
    // Parent/Guardian (merged in from the former Student Monitoring Add Student modal)
    p_first: "", p_last: "", relationship: "", p_contact: "", p_email: "",
    is_active: true,
  });
  const [gradeLevels,  setGradeLevels]  = useState([]);   // grade-level options
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");
  const [credentials,  setCredentials]  = useState(null); // generated login shown after create
  const [copiedField,  setCopiedField]  = useState("");   // which credential was just copied

  // load grade levels for the dropdown
  useEffect(() => {
    fetchAllSections()
      .then((res) => setGradeLevels(res.data ?? []))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // validate + create the student account, then surface its login credentials
  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = [
      ["First Name", form.first_name.trim()],
      ["Last Name", form.last_name.trim()],
      ["Date of Birth", form.date_of_birth],
      ["Gender", form.gender],
      ["Grade Level", form.gl_id],
      ["Enrollment Date", form.enrollment_date],
      ["Home Address", form.address.trim()],
      ["Parent/Guardian First Name", form.p_first.trim()],
      ["Parent/Guardian Last Name", form.p_last.trim()],
      ["Relationship to Student", form.relationship],
    ].filter(([, v]) => !v).map(([label]) => label);
    if (missing.length) {
      setError(`Please fill the required field(s): ${missing.join(", ")}.`);
      return;
    }
    // Contact numbers are optional, but must be a valid PH mobile number when provided.
    if (form.contact_number.trim() && !isPhMobile(form.contact_number)) { setError(PH_MOBILE_HINT); return; }
    if (form.p_contact.trim() && !isPhMobile(form.p_contact)) { setError(PH_MOBILE_HINT); return; }
    setSaving(true);
    setError("");
    try {
      // Password = DOB digits (e.g. 20101225); fallback if no DOB provided
      const dobDigits = form.date_of_birth
        ? form.date_of_birth.replace(/\D/g, "")
        : `LCA${new Date().getFullYear()}`;

      // Temp email — backend replaces it with a name-based firstname.lastname@lca.edu
      const tempBase = `${form.first_name.toLowerCase().replace(/\s+/g,"")}.${form.last_name.toLowerCase().replace(/\s+/g,"")}.${Date.now()}`;
      const enrollment_date = form.enrollment_date || new Date().toISOString().split("T")[0];

      const res = await createStudent({
        email:    `${tempBase}@lca.edu`,
        password: dobDigits,
        username: tempBase,
        first_name:      form.first_name.trim(),
        last_name:       form.last_name.trim(),
        date_of_birth:   form.date_of_birth,
        gender:          form.gender,
        gl_id:           form.gl_id ? Number(form.gl_id) : undefined,
        contact_number:  form.contact_number.trim(),
        address:         form.address.trim(),
        enrollment_date,
        source:          "diagnostic",
        is_active:       form.is_active,
        parent: {
          parent_name:             `${form.p_first.trim()} ${form.p_last.trim()}`.trim(),
          contact_number:          form.p_contact.trim(),
          email:                   form.p_email.trim() || null,
          relationship_to_student: form.relationship,
        },
      });

      const studentId = res.data?.student_id;

      // Login is the Student ID number; email is the name-based address the backend generated.
      setCredentials({
        studentId,
        email:    res.data?.login_email ?? `${studentId}@lca.edu`,
        password: dobDigits,
        student:  res.data,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // copy a credential value and briefly show a "copied" check on that field
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 2000);
    });
  };

  // ── Credentials card (shown after successful creation) ────────────────────
  if (credentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">

          {/* Success header */}
          <div className="bg-primary px-4 sm:px-8 py-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-2xl" style={fillStyle}>check_circle</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-headline">Account Created!</h2>
              <p className="text-white/70 text-sm">
                {credentials.student?.first_name} {credentials.student?.last_name}'s student account is ready.
              </p>
            </div>
          </div>

          <div className="px-4 sm:px-8 py-6 space-y-4">
            <p className="text-sm text-on-surface-variant">
              Share these login credentials with the student. They can change their password later from their profile settings.
            </p>

            {/* Credentials list */}
            {[
              { label: "Student ID",  value: String(credentials.studentId), icon: "badge",  field: "studentId" },
              { label: "Email",       value: credentials.email,             icon: "mail",   field: "email"     },
              { label: "Password",    value: credentials.password,          icon: "key",    field: "password"  },
            ].map(({ label, value, icon, field }) => (
              <div key={field} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-primary text-base" style={fillStyle}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-on-surface truncate">{value}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(value, field)}
                  className="shrink-0 text-on-surface-variant hover:text-primary transition-colors"
                  title="Copy"
                >
                  <span className="material-symbols-outlined text-base">
                    {copiedField === field ? "check" : "content_copy"}
                  </span>
                </button>
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors"
              >
                Close
              </button>
              {/* Start Diagnostic -> onCreated(student) = page's handleStudentCreated() (navigates to RecordDiagnostic) */}
              <button
                onClick={() => onCreated(credentials.student)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Start Diagnostic
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-4 sm:px-8 pt-8 pb-4 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-primary font-headline">New Student Assessment</h2>
            <p className="text-on-surface-variant text-sm mt-1">Enroll a new student for diagnostic placement testing.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors mt-1">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 sm:px-8 pb-8 space-y-4 overflow-y-auto min-h-0">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* First / Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">First Name <span className="text-red-500">*</span></label>
              <input
                type="text" required value={form.first_name} onChange={(e) => set("first_name", e.target.value)}
                placeholder="e.g. Josiah"
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Last Name <span className="text-red-500">*</span></label>
              <input
                type="text" required value={form.last_name} onChange={(e) => set("last_name", e.target.value)}
                placeholder="e.g. Miller"
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* DOB / Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Date of Birth <span className="text-red-500">*</span>
                <span className="ml-1 text-primary normal-case font-normal tracking-normal">— used as password</span>
              </label>
              <input
                type="date" required value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Gender <span className="text-red-500">*</span></label>
              <select
                required value={form.gender} onChange={(e) => set("gender", e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select Gender</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
          </div>

          {/* Grade Level */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Grade Level <span className="text-red-500">*</span></label>
            <select
              required value={form.gl_id} onChange={(e) => set("gl_id", Number(e.target.value))}
              className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">Select Grade Level</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Enrollment Date */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Enrollment Date <span className="text-red-500">*</span></label>
            <input
              type="date" required value={form.enrollment_date} onChange={(e) => set("enrollment_date", e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Contact Number</label>
            <div className="flex">
              <span className="inline-flex items-center px-4 border border-r-0 border-outline-variant rounded-l-lg bg-surface-container-low text-sm text-on-surface-variant font-semibold">
                +63
              </span>
              <input
                type="tel" value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)}
                placeholder="912 345 6789"
                className="flex-1 border border-outline-variant rounded-r-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Home Address */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Home Address <span className="text-red-500">*</span></label>
            <input
              type="text" required value={form.address} onChange={(e) => set("address", e.target.value)}
              placeholder="Street, Barangay, City, Province, Zip Code"
              className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Parent / Guardian (merged from the former Student Monitoring Add Student modal) */}
          <div className="pt-3 mt-1 border-t border-outline-variant/30">
            <h3 className="text-sm font-extrabold text-on-surface mb-3">Parent / Guardian</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">First Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.p_first} onChange={(e) => set("p_first", e.target.value)}
                  placeholder="e.g. Maria"
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Last Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.p_last} onChange={(e) => set("p_last", e.target.value)}
                  placeholder="e.g. Miller"
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Relationship <span className="text-red-500">*</span></label>
                <select required value={form.relationship} onChange={(e) => set("relationship", e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                  <option value="">Select</option>
                  <option>Mother</option>
                  <option>Father</option>
                  <option>Guardian</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Contact Number</label>
                <div className="flex items-stretch border border-outline-variant rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                  <span className="inline-flex items-center px-3 shrink-0 border-r border-outline-variant bg-surface-container-low text-sm text-on-surface-variant font-semibold">+63</span>
                  <input type="tel" value={form.p_contact} onChange={(e) => set("p_contact", e.target.value)}
                    placeholder="912 345 6789"
                    className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-[11px] font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Email <span className="normal-case font-normal tracking-normal text-on-surface-variant/70">(optional)</span>
              </label>
              <input type="email" value={form.p_email} onChange={(e) => set("p_email", e.target.value)}
                placeholder="parent@email.com"
                className="w-full border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)}
              className="w-4 h-4 accent-primary" />
            Activate account immediately
          </label>

          {/* Credential preview hint */}
          <div className="flex items-start gap-2 px-4 py-3 bg-primary/5 rounded-xl border border-primary/10">
            <span className="material-symbols-outlined text-primary text-base mt-0.5" style={fillStyle}>info</span>
            <div className="text-xs text-on-surface-variant leading-relaxed">
              <span className="font-bold text-primary">Auto-generated credentials — </span>
              Login: <span className="font-bold text-on-surface">Student ID number</span>
              {" · "}Password: <span className="font-bold text-on-surface">
                {form.date_of_birth ? form.date_of_birth.replace(/\D/g, "") : "date of birth digits"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
              Cancel
            </button>
            {/* Create & Generate Account -> handleSubmit() (createStudent, then shows credentials card) */}
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create & Generate Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PAGE_SIZE = 5;

// windowed page numbers with ellipsis
function buildPages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, "…", total];
  if (current >= total - 2) return [1, "…", total - 2, total - 1, total];
  return [1, "…", current, "…", total];
}

// one summary stat card at the top of the page
const StatCard = ({ label, value, sub, icon, tint }) => (
  <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant leading-tight">{label}</p>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        <span className="material-symbols-outlined text-lg" style={fillStyle}>{icon}</span>
      </div>
    </div>
    <p className="font-headline text-4xl font-extrabold text-on-surface mt-3">{value}</p>
    <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">{sub}</p>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DiagnosticAssessments() {
  const navigate        = useNavigate();
  const schoolYearLabel = useSchoolYear();
  const [students,    setStudents]    = useState([]);
  const [diagMap,     setDiagMap]     = useState({}); // student_id → diagnostic row
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [search,      setSearch]      = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [nameSort,    setNameSort]    = useState("asc"); // "asc" | "desc": Name column A→Z / Z→A
  const [page,        setPage]        = useState(1);
  const [openMenu,    setOpenMenu]    = useState(null); // student_id of open kebab
  const [showModal,   setShowModal]   = useState(false); // New Student modal open?
  const [viewTarget,  setViewTarget]  = useState(null); // student row for the detail modal

  // load students + their diagnostic rows together
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [stuRes, diagRes] = await Promise.all([
        fetchAllStudents(),
        fetchDiagnostics(),
      ]);
      // Only show students created via the diagnostic flow
      setStudents((stuRes.data ?? []).filter((s) => s.source === "diagnostic"));
      const map = {};
      (diagRes.data ?? []).forEach((d) => { map[d.student_id] = d; }); // index diagnostics by student
      setDiagMap(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // after creating a student, jump straight into recording their diagnostic
  const handleStudentCreated = (student) => {
    setShowModal(false);
    navigate(`/admin/diagnostic/record/${student.student_id}`);
  };

  const diagnosticStudents = students; // already filtered by source === "diagnostic"

  // Placement Basis is a placeholder until a stored field exists.
  const basisOf = () => DEFAULT_BASIS;

  // unique grade-level options for the filter dropdown (natural-sorted)
  const gradeOptions = [...new Set(
    diagnosticStudents.map((s) => s.grade_level?.level_name).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // apply search + grade filters
  const filtered = diagnosticStudents.filter((s) => {
    const name  = `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || String(s.student_id).includes(search);
    const matchGrade  = !gradeFilter || s.grade_level?.level_name === gradeFilter;
    return matchSearch && matchGrade;
  });

  // sort the filtered rows by "last name, first name" (A→Z or Z→A)
  const sorted = [...filtered].sort((a, b) => compareByName(a, b, nameSort === "desc" ? -1 : 1));

  // paginate the sorted rows
  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const startIndex   = (currentPage - 1) * PAGE_SIZE;
  const pageRows     = sorted.slice(startIndex, startIndex + PAGE_SIZE);

  // Stats
  const totalRecords  = diagnosticStudents.length;
  const generated     = diagnosticStudents.filter((s) => diagMap[s.student_id]?.start_pace != null).length; // have a generated start PACE
  // const accepted   = "—";  // paired with the hidden "PACE Recommendations Accepted" card below
  const assessedYear  = diagnosticStudents.length;

  const resetFilters = () => { setSearch(""); setGradeFilter(""); setPage(1); };

  return (
    <PrincipalLayout schoolYearLabel={loading ? "..." : schoolYearLabel}>
      {showModal && (
        <NewStudentModal
          onClose={() => setShowModal(false)}
          onCreated={handleStudentCreated}
        />
      )}
      {viewTarget && (
        <StudentDiagnosticDetailModal
          student={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      )}

      <main className="p-4 sm:p-8 w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Header */}
        <header className="flex items-start justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold text-primary font-headline tracking-tight">
              Diagnostic Assessment Management
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Manage student diagnostic assessment records and review generated PACE recommendations.
            </p>
          </div>
          {/* Create New Student Assessment -> setShowModal(true) opens <NewStudentModal> */}
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg" style={fillStyle}>add</span>
            Create New Student Assessment
          </button>
        </header>

        {/* Stat cards. NOTE: 3 columns / 3 skeletons because "PACE Recommendations
            Accepted" is hidden below — restore both to 4 when that card comes back. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)
          ) : (
            <>
              <StatCard label="Total Diagnostic Records" value={totalRecords} sub="Total students with diagnostic records" icon="description" tint="bg-blue-50 text-blue-500" />
              <StatCard label="PACE Recommendations Generated" value={generated} sub="System recommendations generated for students" icon="description" tint="bg-orange-50 text-orange-500" />
              {/* PACE Recommendations Accepted (hidden — no acceptance workflow yet, so the
                  value was always a placeholder dash; code kept for easy restore)
              <StatCard label="PACE Recommendations Accepted" value={accepted} sub="Accepted by the principal (Principal Recommendation)" icon="task_alt" tint="bg-green-50 text-green-500" />
              */}
              <StatCard label="Students Assessed This School Year" value={assessedYear} sub="Students with diagnostic records this school year" icon="groups" tint="bg-purple-50 text-purple-500" />
            </>
          )}
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-4 mb-6 flex items-end gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2  text-on-surface-variant text-base">search</span>
            {/* search -> setSearch + page 1 (client-side filter) */}
            <label className="block text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Student Name or ID</label>
            <input
              type="text"
              placeholder="Search student name or ID…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
            />
            {/* clear (×) -> empty the box + reset to page 1 */}
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); setPage(1); }}
                aria-label="Clear search"
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none"
              >close</button>
            )}
          </div>
          {/* grade filter -> setGradeFilter + page 1 */}
          <div>
            <label className="block text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Grade Level</label>
            <select
              value={gradeFilter}
              onChange={(e) => { setGradeFilter(e.target.value); setPage(1); }}
              className="px-3.5 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm focus:outline-none focus:border-primary bg-white min-w-[150px]"
            >
              <option value="">All Grade Levels</option>
              {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {/* Reset Filters -> resetFilters() clears search/grade + page 1 */}
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-outline-variant/30 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-base">restart_alt</span>
            Reset Filters
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 space-y-4">
              {[1,2,3].map((i) => (
                <div key={i} className="flex gap-4 items-center">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2 w-28" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4 sm:px-8">
              <div className="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-3xl text-primary" style={fillStyle}>assignment</span>
              </div>
              <h3 className="text-lg font-bold text-primary font-headline mb-1">No diagnostic records</h3>
              <p className="text-on-surface-variant text-sm max-w-sm mb-6">
                {search || gradeFilter
                  ? "No students match the current filters."
                  : "Click \"Create New Student Assessment\" to enroll a student for diagnostic testing."}
              </p>
              {!(search || gradeFilter) && (
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors">
                  <span className="material-symbols-outlined text-lg" style={fillStyle}>add</span>
                  Create New Student Assessment
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant/20">
                      {["Student ID", "Student Name", "Grade Level", "Placement Basis", "Actions"].map((h) => (
                        <th key={h} className={`px-6 py-3.5 text-[13px] font-extrabold text-on-surface-variant uppercase tracking-widest whitespace-nowrap ${h === "Actions" ? "text-right" : "text-left"}`}>
                          {h === "Student Name" ? (
                            // Clickable header: toggles A→Z / Z→A by last name, first name
                            <button
                              type="button"
                              onClick={() => setNameSort((d) => (d === "asc" ? "desc" : "asc"))}
                              className="inline-flex items-center gap-1 font-extrabold tracking-widest uppercase hover:text-primary transition-colors"
                              title="Sort by name"
                            >
                              {h}
                              <span className="material-symbols-outlined text-sm leading-none">
                                {nameSort === "asc" ? "arrow_upward" : "arrow_downward"}
                              </span>
                            </button>
                          ) : (
                            h
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {pageRows.map((s) => {
                      const basis = basisOf(s);
                      return (
                        <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="px-6 py-4 font-bold text-on-surface whitespace-nowrap">{s.student_id}</td>
                          <td className="px-6 py-4 font-bold text-on-surface whitespace-nowrap">{lastFirst(s)}</td>
                          <td className="px-6 py-4 text-on-surface-variant whitespace-nowrap">{s.grade_level?.level_name ?? "—"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${BASIS_STYLES[basis]}`}>
                              {basis}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              {/* View Details -> setViewTarget(s) opens <StudentDiagnosticDetailModal> */}
                              <button
                                onClick={() => setViewTarget(s)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                              >
                                <span className="material-symbols-outlined text-sm">visibility</span>
                                View Details
                              </button>
                              {/* Record -> navigate() to RecordDiagnostic.jsx for this student */}
                              <button
                                onClick={() => navigate(`/admin/diagnostic/record/${s.student_id}`)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
                              >
                                <span className="material-symbols-outlined text-sm">edit_note</span>
                                Record
                              </button>
                              {/* kebab -> setOpenMenu toggles this row's dropdown */}
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMenu(openMenu === s.student_id ? null : s.student_id)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">more_vert</span>
                                </button>
                                {openMenu === s.student_id && (
                                  <div className="absolute right-0 top-9 z-50 w-48 bg-white rounded-xl shadow-xl border border-outline-variant/20 py-1">
                                    <button
                                      onClick={() => { setOpenMenu(null); navigate(`/admin/diagnostic/record/${s.student_id}`); }}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-base">edit_note</span>
                                      Record Diagnostic
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/10">
                <p className="text-xs text-on-surface-variant">
                  Showing {startIndex + 1} to {Math.min(startIndex + PAGE_SIZE, filtered.length)} of {filtered.length} results
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  {buildPages(currentPage, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`e${i}`} className="w-8 text-center text-sm text-on-surface-variant">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                          currentPage === p ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Click-away for kebab menus */}
        {openMenu !== null && (
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
        )}
      </main>
    </PrincipalLayout>
  );
}

