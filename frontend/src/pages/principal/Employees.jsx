// Supervisor Management (principal): list/search supervisors (teachers) with stats,
// add a supervisor + assign grade levels, view details, export CSV.
// Backend chain (frontend api/employees.js -> routes/employees.routes.js):
//   list:  GET  /employees/supervisors       -> controllers/employees.controller.js > getSupervisors (~line 15)     -> services/employees.service.js > getSupervisors (~line 42)
//   stats: GET  /employees/supervisors/stats -> controllers/employees.controller.js > getSupervisorStats (~line 20) -> services/employees.service.js > getSupervisorStats (~line 114)
//   add:   POST /employees                   -> controllers/employees.controller.js > createEmployee (~line 25)     -> services/employees.service.js > createEmployee (~line 156)
//   grade-level picker uses api/sections.js fetchAllSections (see SchoolSections.jsx chain).
import { useState, useEffect, useMemo, useRef } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchSupervisors, fetchSupervisorStats, addSupervisor } from "../../api/employees.js";
import { fetchAllSections } from "../../api/sections.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// SUP-2025-001 — year from the active school year, sequence from the teacher id
const formatSupervisorId = (id, year) =>
  `SUP-${year}-${String(id ?? 0).padStart(3, "0")}`;

// join an array as "a, b, c" (with optional prefix per item), or em dash if empty
const listOrDash = (arr, prefix = "") =>
  arr && arr.length ? arr.map((v) => `${prefix}${v}`).join(", ") : "—";

// ─── Add Supervisor Modal ─────────────────────────────────────────────────────
const defaultForm = {                                // blank Add Supervisor form
  first_name: "",
  last_name: "",
  contact_number: "",
  email: "",
  username: "",
  password: "",
  confirm_password: "",
  account_status: "active",
};

// Multi-select dropdown for grade levels (assigns which grades a supervisor covers)
function GradeLevelSelect({ options, selected, onChange, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // close the dropdown when clicking anywhere outside it
  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // add/remove a grade-level id from the selection
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const labels = options.filter((o) => selected.includes(o.id)).map((o) => o.name); // names shown on the button

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-outline-variant/40 rounded-lg px-4 py-3 text-sm text-left focus:ring-2 focus:ring-primary/20 outline-none"
      >
        <span className={labels.length ? "text-on-surface" : "text-on-surface-variant"}>
          {loading ? "Loading grade levels..." : labels.length ? labels.join(", ") : "Select grade levels"}
        </span>
        <span className="material-symbols-outlined text-on-surface-variant text-lg shrink-0">expand_more</span>
      </button>
      {open && !loading && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-outline-variant/30 rounded-xl shadow-lg py-1">
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-on-surface-variant">No grade levels available.</p>
          ) : (
            options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.id)}
                  onChange={() => toggle(opt.id)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-on-surface">{opt.name}</span>
                {opt.faculty?.length > 0 && (
                  <span className="ml-auto text-[10px] text-on-surface-variant">assigned: {opt.faculty[0].name}</span>
                )}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Rendered by <Employees> (showModal). onClose = () => setShowModal(false);
// onSuccess = () => { setLoading(true); setReloadKey(k=>k+1) } which refetches the list.
function AddSupervisorModal({ onClose, onSuccess }) {
  const [form, setForm]       = useState(defaultForm);
  const [gradeIds, setGradeIds] = useState([]);        // selected grade-level ids
  const [levels, setLevels]   = useState([]);          // grade-level options for the picker
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [showPw, setShowPw]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val })); // update one form field

  // load the grade-level options for the assignment picker
  useEffect(() => {
    const loadLevels = async () => {
      try {
        const res = await fetchAllSections();
        setLevels(res.data ?? []);
      } catch {
        setLevels([]);
      } finally {
        setLevelsLoading(false);
      }
    };
    loadLevels();
  }, []);

  // validate then create the supervisor account (role fixed to "teacher")
  const handleSubmit = async () => {
    if (!form.first_name || !form.last_name || !form.email || !form.username || !form.password || !form.contact_number.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addSupervisor({                            // POST new supervisor + grade assignments
        first_name:     form.first_name,
        last_name:      form.last_name,
        contact_number: form.contact_number,
        email:          form.email,
        username:       form.username,
        password:       form.password,
        role:           "teacher",                     // supervisors are teacher-role accounts
        is_active:      form.account_status === "active",
        grade_level_ids: gradeIds,
      });
      onSuccess();                                     // parent reloads the list
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border border-outline-variant/40 rounded-lg px-4 py-3 text-sm font-medium text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary/20 outline-none";
  const labelClass = "block text-sm font-semibold text-on-surface mb-1.5";
  const reqMark    = <span className="text-red-500">*</span>;
  const sectionHd  = "text-xs font-extrabold tracking-widest uppercase text-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-4 sm:px-8 pt-7 pb-5 flex items-start justify-between gap-4 sticky top-0 bg-white">
          <div>
            <h2 className="font-headline text-2xl font-extrabold text-primary">Add Supervisor</h2>
            <p className="text-sm text-on-surface-variant mt-1">Create a new supervisor account and assign grade levels.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant hover:text-primary transition-colors shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-4 sm:px-8 pb-2 space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* Personal Information */}
          <section>
            <h3 className={`${sectionHd} mb-4`}>Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>First Name {reqMark}</label>
                <input className={inputClass} placeholder="Enter first name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Last Name {reqMark}</label>
                <input className={inputClass} placeholder="Enter last name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Contact Number {reqMark}</label>
                <input className={inputClass} required placeholder="Enter contact number" value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} />
              </div>
            </div>
          </section>

          {/* Account Information */}
          <section>
            <h3 className={`${sectionHd} mb-4`}>Account Information</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email Address {reqMark}</label>
                  <input className={inputClass} type="email" placeholder="Enter email address" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Username {reqMark}</label>
                  <input className={inputClass} placeholder="Enter username" value={form.username} onChange={(e) => set("username", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Password {reqMark}</label>
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-11`}
                      type={showPw ? "text" : "password"}
                      placeholder="Enter password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
                      <span className="material-symbols-outlined text-lg">{showPw ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Confirm Password {reqMark}</label>
                  <div className="relative">
                    <input
                      className={`${inputClass} pr-11`}
                      type={showConfirm ? "text" : "password"}
                      placeholder="Confirm password"
                      value={form.confirm_password}
                      onChange={(e) => set("confirm_password", e.target.value)}
                    />
                    <button type="button" onClick={() => setShowConfirm((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
                      <span className="material-symbols-outlined text-lg">{showConfirm ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Account Status {reqMark}</label>
                <select className={`${inputClass} cursor-pointer`} value={form.account_status} onChange={(e) => set("account_status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </section>

          {/* Grade Level Assignment */}
          <section>
            <h3 className={`${sectionHd} mb-4`}>Grade Level Assignment</h3>
            <label className={labelClass}>Assigned Grade Levels {reqMark}</label>
            <GradeLevelSelect
              options={levels}
              selected={gradeIds}
              onChange={setGradeIds}
              loading={levelsLoading}
            />
            <p className="text-xs text-on-surface-variant mt-2">Select one or more grade levels to assign to this supervisor.</p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-5 flex items-center justify-end gap-3 border-t border-outline-variant/20 mt-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
          {/* Create Supervisor -> handleSubmit() validates + addSupervisor(), then onSuccess/onClose */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving
              ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Saving...</>
              : <><span className="material-symbols-outlined text-base">person_add</span> Create Supervisor</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Details Modal ───────────────────────────────────────────────────────
// label : value row used throughout the details modal
function InfoRow({ label, children }) {
  return (
    <div className="flex items-start text-sm">
      <span className="w-36 shrink-0 font-bold text-on-surface">{label}</span>
      <span className="text-on-surface-variant mr-2">:</span>
      <span className="text-on-surface-variant">{children}</span>
    </div>
  );
}

// Read-only supervisor profile: info, assigned grade levels / PACE modules, and a
// per-grade student count table.
// Rendered by <Employees> (viewSup). onClose = () => setViewSup(null).
// NOTE: onEdit is NOT passed at the render site, so the "Edit Supervisor" button here
// (onClick={() => onEdit?.(sup)}) is currently a no-op - edit isn't wired up yet.
function ViewDetailsModal({ supervisor: sup, year, onClose, onEdit }) {
  // `sup` is the same row the list loaded via fetchSupervisors; its gradeLevels / paceModules /
  // gradeLevelDetails / totalStudents are built in the backend by
  // services/employees.service.js > getSupervisors (~line 42) (per-grade student counts included).
  const gradeDetails = sup.gradeLevelDetails ?? [];
  const totalStudents = sup.totalStudents             // use the API total, else sum the per-grade counts
    ?? gradeDetails.reduce((sum, d) => sum + (d.studentCount ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-primary">View Supervisor</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">Detailed information and assignments of the supervisor.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Supervisor Information */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>person</span>
              <h3 className="font-bold text-primary">Supervisor Information</h3>
            </div>
            <div className="space-y-3">
              <InfoRow label="Supervisor ID">
                <span className="font-mono">{formatSupervisorId(sup.teacher_id, year)}</span>
              </InfoRow>
              <InfoRow label="Full Name">{sup.first_name} {sup.last_name}</InfoRow>
              <InfoRow label="Contact Number">{sup.contact_number ?? "—"}</InfoRow>
              <InfoRow label="Email Address">{sup.email ?? "—"}</InfoRow>
              <InfoRow label="Status">
                {sup.is_active ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-orange-100 text-secondary text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />Inactive
                  </span>
                )}
              </InfoRow>
            </div>
          </section>

          {/* Assignment cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-outline-variant/30 rounded-2xl px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-lg">school</span>
                <p className="text-xs font-bold text-primary">Assigned Grade Levels</p>
              </div>
              {sup.gradeLevels?.length
                ? <ul className="space-y-1.5 text-sm text-on-surface-variant">
                    {sup.gradeLevels.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                : <p className="text-sm text-on-surface-variant">—</p>}
            </div>
            <div className="border border-outline-variant/30 rounded-2xl px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-lg">menu_book</span>
                <p className="text-xs font-bold text-primary">PACE Modules Supervised</p>
              </div>
              {sup.paceModules?.length
                ? <ul className="space-y-1.5 text-sm text-on-surface-variant">
                    {sup.paceModules.map((m) => <li key={m}>PACE {m}</li>)}
                  </ul>
                : <p className="text-sm text-on-surface-variant">—</p>}
            </div>
          </div>

          {/* Students Under Supervision */}
          <section className="border border-outline-variant/30 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="material-symbols-outlined text-primary text-xl" style={fillStyle}>groups</span>
              <h3 className="font-bold text-primary">Students Under Supervision</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest bg-surface-container/40">
                  <th className="px-4 py-2.5 text-left">Grade Level</th>
                  <th className="px-4 py-2.5 text-right">Number of Students</th>
                </tr>
              </thead>
              <tbody>
                {gradeDetails.length ? (
                  gradeDetails.map((d) => (
                    <tr key={d.gl_id} className="border-t border-outline-variant/20">
                      <td className="px-4 py-3 text-on-surface">{d.name}</td>
                      <td className="px-4 py-3 text-right text-on-surface-variant">{d.studentCount} Students</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-outline-variant/20">
                    <td colSpan={2} className="px-4 py-4 text-center text-on-surface-variant">No grade levels assigned.</td>
                  </tr>
                )}
                <tr className="border-t border-outline-variant/30 bg-surface-container/20">
                  <td className="px-4 py-3 font-bold text-on-surface">Total Students</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">{totalStudents} Students</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-outline-variant/20">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Close
          </button>
          {/* Edit Supervisor -> onEdit?.(sup); but Employees doesn't pass onEdit, so this is currently a no-op */}
          <button
            onClick={() => onEdit?.(sup)}
            className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            Edit Supervisor
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Employees() {
  const [supervisors, setSupervisors] = useState([]);  // supervisor list from the API
  const [stats,       setStats]       = useState(null); // total/active/inactive counts
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [search,      setSearch]      = useState("");   // name/ID search
  const [statusFilter, setStatusFilter] = useState("all"); // all/active/inactive
  const [page,        setPage]        = useState(1);
  const [showModal,   setShowModal]   = useState(false); // Add Supervisor modal open?
  const [viewSup,     setViewSup]     = useState(null);  // supervisor open in View Details
  const [reloadKey,   setReloadKey]   = useState(0);     // bump to refetch after adding
  const perPage = 8;
  const schoolYearLabel = useSchoolYear();

  // "2025-2026" → "2025"; fall back to the current year
  const year = (schoolYearLabel?.match(/\d{4}/)?.[0]) ?? String(new Date().getFullYear());

  // load supervisors + stats together (re-runs when reloadKey changes)
  useEffect(() => {
    const load = async () => {
      try {
        const [supRes, statRes] = await Promise.all([
          fetchSupervisors(),
          fetchSupervisorStats(),
        ]);
        setSupervisors(supRes.data);
        setStats(statRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reloadKey]);

  // client-side search (name or ID) + status filter
  const filtered = useMemo(() => supervisors.filter((sup) => {
    const fullName = `${sup.first_name} ${sup.last_name}`.toLowerCase();
    const supId    = formatSupervisorId(sup.teacher_id, year).toLowerCase();
    const term     = search.toLowerCase();
    const matchSearch = fullName.includes(term) || supId.includes(term);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? sup.is_active : !sup.is_active);
    return matchSearch && matchStatus;
  }), [supervisors, search, statusFilter, year]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  // export the filtered supervisor list to a CSV download
  const handleExport = () => {
    const headers = ["Supervisor ID", "Name", "Contact Number", "Assigned Grade Levels", "PACE Modules Supervised", "Status"];
    const rows = filtered.map((s) => [
      formatSupervisorId(s.teacher_id, year),
      `${s.first_name} ${s.last_name}`,
      s.contact_number ?? "",
      listOrDash(s.gradeLevels),
      listOrDash(s.paceModules, "PACE "),
      s.is_active ? "Active" : "Inactive",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `supervisors-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // the three summary cards across the top (values come from the stats endpoint)
  const statCards = [
    { label: "Total Supervisors",    value: stats?.total,    icon: "groups",     iconBg: "bg-primary-fixed",   iconColor: "text-primary"   },
    { label: "Active Supervisors",   value: stats?.active,   icon: "check_circle", iconBg: "bg-green-100",      iconColor: "text-green-600" },
    { label: "Inactive Supervisors", value: stats?.inactive, icon: "warning",    iconBg: "bg-orange-100",      iconColor: "text-secondary" },
  ];

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {showModal && (
          <AddSupervisorModal
            onClose={() => setShowModal(false)}
            onSuccess={() => { setLoading(true); setReloadKey((k) => k + 1); }}
          />
        )}
        {viewSup && (
          <ViewDetailsModal supervisor={viewSup} year={year} onClose={() => setViewSup(null)} />
        )}

        {/* Page header */}
        <header className="flex flex-wrap justify-between items-start gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-primary font-headline tracking-tight">Supervisor Management</h1>
            <p className="text-on-surface-variant text-sm mt-1">View and manage information of all teaching supervisors in the school.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Export -> handleExport() downloads the filtered list as CSV */}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-lg">file_upload</span>
              Export
            </button>
            {/* Add Supervisor -> setShowModal(true) opens <AddSupervisorModal> */}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Supervisor
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {statCards.map((card) => (
            <div key={card.label} className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/20 shadow-sm flex items-center gap-5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${card.iconBg} ${card.iconColor}`}>
                <span className="material-symbols-outlined" style={fillStyle}>{card.icon}</span>
              </div>
              <div>
                <p className="text-on-surface-variant uppercase tracking-widest font-bold text-[11px] mb-1">{card.label}</p>
                {loading
                  ? <Skeleton className="h-9 w-16" />
                  : <p className="text-4xl font-extrabold text-primary font-headline tracking-tighter">{card.value ?? 0}</p>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 relative min-w-[280px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">
              <span className="material-symbols-outlined text-lg">search</span>
            </span>
            {/* search -> setSearch + page 1 (filters client-side via useMemo) */}
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by supervisor name or ID..."
              className="w-full pl-12 pr-11 py-3 bg-surface-container-lowest border border-outline-variant/20 rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm font-body"
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
          {/* status filter -> setStatusFilter + page 1 */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="appearance-none h-11 bg-surface-container-lowest border border-outline-variant/20 rounded-xl pl-4 pr-10 text-sm font-semibold text-on-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-on-surface-variant pointer-events-none">
          expand_more
        </span>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest bg-surface-container/30 border-b border-surface-container">
                  <th className="px-6 py-4">Supervisor ID</th>
                  <th className="px-6 py-4">Supervisor Name</th>
                  <th className="px-6 py-4">Contact Number</th>
                  <th className="px-6 py-4">Assigned Grade Levels</th>
                  <th className="px-6 py-4">PACE Modules Supervised</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-surface-container/50">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-6 py-6"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-on-surface-variant text-sm">
                      No supervisors found.
                    </td>
                  </tr>
                ) : (
                  // one row per supervisor; "View Details" opens the read-only modal
                  paginated.map((sup) => (
                    <tr key={sup.id} className="border-b border-surface-container/50 hover:bg-surface-container/30 transition-colors align-top">
                      <td className="px-6 py-5">
                        <span className="text-xs font-bold text-on-surface-variant font-mono">{formatSupervisorId(sup.teacher_id, year)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-on-surface text-sm">{sup.first_name} {sup.last_name}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm text-on-surface-variant">{sup.contact_number ?? "—"}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm text-on-surface-variant">{listOrDash(sup.gradeLevels)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm text-on-surface-variant">{listOrDash(sup.paceModules, "PACE ")}</span>
                      </td>
                      <td className="px-6 py-5">
                        {sup.is_active ? (
                          <span className="bg-green-100 text-green-700 text-[10px] font-extrabold uppercase px-3 py-1 rounded-full">Active</span>
                        ) : (
                          <span className="bg-orange-100 text-secondary text-[10px] font-extrabold uppercase px-3 py-1 rounded-full">Inactive</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        {/* View Details -> setViewSup(sup) opens <ViewDetailsModal> */}
                        <button
                          onClick={() => setViewSup(sup)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-[11px] font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-5 flex items-center justify-between border-t border-surface-container">
            <p className="text-sm text-on-surface-variant font-medium">
              Showing <span className="font-bold text-on-surface">{filtered.length === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, filtered.length)}</span> of <span className="font-bold text-on-surface">{filtered.length}</span> entries
            </p>
            {/* pager -> setPage (client-side slice of the filtered list) */}
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30">
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${p === page ? "bg-primary text-white shadow-md" : "text-on-surface-variant hover:bg-surface-container"}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30">
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </PrincipalLayout>
  );
}
