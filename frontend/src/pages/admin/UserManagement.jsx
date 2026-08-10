// User Management (sysadmin): list/filter users with stats, add a user, toggle active, edit.
// Backend chain (frontend api/admin.js -> routes/admin.routes.js, mounted at /admin):
//   list:   GET   /admin/users             -> controllers/adminUsers.controller.js > getUsers (~line 6)          -> services/adminUsers.service.js > listUsers (~line 88)
//   create: POST  /admin/users             -> controllers/adminUsers.controller.js > createUser (~line 26)       -> services/adminUsers.service.js > createUser (~line 265)
//   edit:   PUT   /admin/users/:id         -> controllers/adminUsers.controller.js > updateUser (~line 38)       -> services/adminUsers.service.js > updateUser (~line 197)
//   toggle: PATCH /admin/users/:id/status  -> controllers/adminUsers.controller.js > updateUserStatus (~line 12) -> services/adminUsers.service.js > setUserActive (~line 181)
import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "../../components/AdminLayout.jsx";
import { fetchUsers, setUserActive, createUser, updateUser } from "../../api/admin.js";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { isPhMobile, PH_MOBILE_HINT } from "../../utils/phone.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const PAGE_SIZE = 10;

// role value (DB) -> display label + badge colors. teacher shows as "Supervisor".
const ROLE_BADGE = {
  principal:     { label: "Principal",     cls: "bg-orange-100 text-orange-700" },
  administrator: { label: "Administrator", cls: "bg-purple-100 text-purple-700" },
  teacher:       { label: "Supervisor",    cls: "bg-blue-100 text-blue-700"     },
  student:       { label: "Student",       cls: "bg-amber-100 text-amber-700"   },
};

const ROLE_FILTERS = [
  { value: "all",           label: "All Roles"      },
  { value: "administrator", label: "Administrators" },
  { value: "principal",     label: "Principals"     },
  { value: "teacher",       label: "Supervisors"    },
  { value: "student",       label: "Students"       },
];

const STATUS_FILTERS = [
  { value: "all",      label: "All Status" },
  { value: "active",   label: "Active"     },
  { value: "inactive", label: "Inactive"   },
];

const STAT_CARDS = [
  { key: "totalUsers",     label: "Total Users",    icon: "groups",         iconBg: "bg-blue-100",   iconColor: "text-blue-600"   },
  { key: "activeUsers",    label: "Active Users",   icon: "verified_user",  iconBg: "bg-green-100",  iconColor: "text-green-600"  },
  { key: "inactiveUsers",  label: "Inactive Users", icon: "person_off",     iconBg: "bg-red-100",    iconColor: "text-red-500"    },
  { key: "administrators", label: "Administrators", icon: "shield_person",  iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  { key: "teachers",       label: "Supervisors",    icon: "school",         iconBg: "bg-teal-100",   iconColor: "text-teal-600"   },
  { key: "students",       label: "Students",       icon: "backpack",       iconBg: "bg-amber-100",  iconColor: "text-amber-600"  },
];

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

// Display name as "Lastname, Firstname"; falls back to whatever we have.
const lastFirst = (u) => {
  const last  = (u.last_name  ?? "").trim();
  const first = (u.first_name ?? "").trim();
  if (last && first) return `${last}, ${first}`;
  return last || first || u.name || "—";
};

// last-login timestamp for the table, or "Never" if none/invalid
const formatLastLogin = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d)) return "Never";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// Compact, windowed page list with ellipsis: 1 … 4 5 [6] 7 8 … 26
const buildPageList = (current, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
};

// coloured role pill (falls back to a neutral style for unknown roles)
const RoleBadge = ({ role }) => {
  const b = ROLE_BADGE[role] ?? { label: role, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${b.cls}`}>
      {b.label}
    </span>
  );
};

// green Active / grey Inactive pill
const StatusBadge = ({ active }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
    active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
  }`}>
    {active ? "Active" : "Inactive"}
  </span>
);

// ── Add New User modal ────────────────────────────────────────────────────────
const CREATE_ROLES = [
  { value: "principal",     label: "Principal"     },
  { value: "teacher",       label: "Supervisor"    },
  { value: "administrator", label: "Administrator" },
];

const LabeledInput = ({ label, required, icon, trailing, children }) => (
  <div className="flex-1">
    <label className="block text-[13px] font-semibold text-on-surface mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      {icon && (
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">{icon}</span>
      )}
      {children}
      {trailing}
    </div>
  </div>
);

// Add New User modal. Validates the form then createUser()s; onCreated hands the
// new user back to the parent (which prepends it to the list).
// Rendered by <UserManagement> (showAdd). onClose = () => setShowAdd(false);
// onCreated = the page's onCreated() (toasts the new login ID + reloads page 1).
function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({                 // all the form fields in one object
    first_name: "", last_name: "", email: "",
    role: "", contact_number: "", password: "", confirm: "",
    status: "active",
  });
  const [showPw, setShowPw]           = useState(false); // password field visible?
  const [showConfirm, setShowConfirm] = useState(false); // confirm field visible?
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value })); // curried onChange per field

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    // client-side validation before hitting the API
    if (!form.first_name.trim())          return setError("First name is required.");
    if (!form.last_name.trim())           return setError("Last name is required.");
    if (!form.email.trim())               return setError("Email address is required.");
    if (!form.role)                       return setError("Please select a role.");
    if (form.contact_number.trim() && !isPhMobile(form.contact_number)) return setError(PH_MOBILE_HINT);
    if (form.password.length < 6)         return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm)   return setError("Passwords do not match.");

    setSaving(true);
    try {
      const res = await createUser({                  // POST /admin/users
        role:           form.role,
        first_name:     form.first_name.trim(),
        last_name:      form.last_name.trim(),
        email:          form.email.trim(),
        password:       form.password,
        is_active:      form.status === "active",
        contact_number: form.contact_number.trim() || null,
      });
      onCreated(res.data);                            // parent adds it to the table
    } catch (err) {
      setError(err.message ?? "Failed to create user.");
      setSaving(false);
    }
  };

  const inputBase = "w-full bg-white border border-outline-variant/40 rounded-lg py-2.5 text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:outline-none";
  const withIcon  = `${inputBase} pl-10 pr-3.5`;
  const withBoth  = `${inputBase} pl-10 pr-10`;
  const selectCls = `${inputBase} px-3.5 pr-9 appearance-none cursor-pointer`;
  const chevron   = <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1 text-outline text-lg pointer-events-none">expand_more</span>;
  const eye = (shown, toggle) => (
    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
      <span className="material-symbols-outlined leading-none text-xl">{shown ? "visibility" : "visibility_off"}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <h3 className="font-headline text-xl font-extrabold text-on-surface">Add New User</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">Fill in the details to create a new user account.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 pb-2 space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}

          {/* Names */}
          <div className="flex gap-3">
            <LabeledInput label="First Name" required icon="person">
              <input value={form.first_name} onChange={set("first_name")} required placeholder="Enter first name" className={withIcon} />
            </LabeledInput>
            <LabeledInput label="Last Name" required icon="person">
              <input value={form.last_name} onChange={set("last_name")} required placeholder="Enter last name" className={withIcon} />
            </LabeledInput>
          </div>

          {/* Email */}
          <LabeledInput label="Email Address" required icon="mail">
            <input type="email" value={form.email} onChange={set("email")} required placeholder="Enter email address" className={withIcon} />
          </LabeledInput>

          {/* Role + Contact Number */}
          <div className="flex gap-3">
            <LabeledInput label="Role" required trailing={chevron}>
              <select value={form.role} onChange={set("role")} required className={selectCls}>
                <option value="" disabled>Select role</option>
                {CREATE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </LabeledInput>
            <LabeledInput label="Contact Number" icon="call">
              <input type="tel" value={form.contact_number} onChange={set("contact_number")} placeholder="Enter contact number" className={withIcon} />
            </LabeledInput>
          </div>

          {/* Passwords */}
          <div className="flex gap-3">
            <LabeledInput label="Password" required icon="lock" trailing={eye(showPw, () => setShowPw((s) => !s))}>
              <input type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} required placeholder="Enter password" className={withBoth} />
            </LabeledInput>
            <LabeledInput label="Confirm Password" required icon="lock" trailing={eye(showConfirm, () => setShowConfirm((s) => !s))}>
              <input type={showConfirm ? "text" : "password"} value={form.confirm} onChange={set("confirm")} required placeholder="Confirm password" className={withBoth} />
            </LabeledInput>
          </div>

          {/* Status */}
          <div className="w-1/2 pr-1.5">
            <LabeledInput label="Status" required trailing={chevron}>
              <select value={form.status} onChange={set("status")} className={selectCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </LabeledInput>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-blue-50 text-blue-700">
            <span className="material-symbols-outlined text-lg shrink-0" style={fillStyle}>info</span>
            <p className="text-[13px]">An account activation email will be sent to the user.</p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 mt-2 border-t border-outline-variant/20">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            Cancel
          </button>
          {/* Create User -> submit() validates + createUser(); onCreated() hands the new row to the parent */}
          <button onClick={submit} disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-bold bg-primary text-white shadow-sm hover:shadow-lg disabled:opacity-60">
            {saving ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit User modal ───────────────────────────────────────────────────────────
// Edit User modal. Prefills from the row, optionally resets the password, then
// updateUser()s. Role isn't editable (shown read-only).
// Rendered by <UserManagement> (editUser). onClose = () => setEditUser(null);
// onSaved = (name) => { setEditUser(null); setBanner(`${name} updated.`); load(); }.
function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({                 // editable fields, seeded from the user row
    full_name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.name || "",
    email:     user.email ?? "",
    status:    user.is_active ? "active" : "inactive",
  });
  const [resetPw, setResetPw]         = useState(false); // "also reset password?" toggle
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const roleLabel = ROLE_BADGE[user.role]?.label ?? user.role ?? "—"; // read-only role label

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim()) return setError("Full name is required.");
    if (!form.email.trim())     return setError("Email address is required.");
    if (resetPw) {                                    // only validate the password if resetting it
      if (password.length < 6)     return setError("Password must be at least 6 characters.");
      if (password !== confirm)    return setError("Passwords do not match.");
    }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email:     form.email.trim(),
        is_active: form.status === "active",
      };
      if (resetPw) payload.password = password;        // only send a password when resetting
      await updateUser(user.user_id, payload);         // PATCH /admin/users/:id
      onSaved(form.full_name.trim());
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to update user.");
      setSaving(false);
    }
  };

  const inputBase = "w-full bg-white border border-outline-variant/40 rounded-lg py-2.5 px-3.5 text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:outline-none";
  const selectCls = `${inputBase} pr-9 appearance-none cursor-pointer`;
  const chevron   = <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1 text-outline text-lg pointer-events-none">expand_more</span>;
  const labelCls  = "block text-[13px] font-bold text-on-surface mb-1.5";
  const eye = (shown, toggle) => (
    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary">
      <span className="material-symbols-outlined text-lg">{shown ? "visibility_off" : "visibility"}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-outline-variant/15">
          <div>
            <h3 className="font-headline text-xl font-extrabold text-on-surface">Edit User</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">Update user account information and access permissions.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-6">
          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}

          {/* User Information */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-on-surface" style={fillStyle}>person</span>
              <h4 className="font-bold text-on-surface">User Information</h4>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                <input value={form.full_name} onChange={set("full_name")} placeholder="Enter full name" className={inputBase} />
              </div>
              <div>
                <label className={labelCls}>Email Address <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="Enter email address" className={inputBase} />
              </div>
              <div>
                <label className={labelCls}>Role <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select value={user.role} disabled className={`${selectCls} opacity-70 cursor-not-allowed`}>
                    <option value={user.role}>{roleLabel}</option>
                  </select>
                  {/* {chevron} para ma edit na pud siya*/}
                </div>
              </div>
            </div>
          </section>

          {/* Account Status */}
          <section className="pt-2 border-t border-outline-variant/15">
            <div className="flex items-center gap-2 mb-4 mt-4">
              <span className="material-symbols-outlined text-on-surface" style={fillStyle}>shield</span>
              <h4 className="font-bold text-on-surface">Account Status</h4>
            </div>
            <div className="w-1/2">
              <label className={labelCls}>Status <span className="text-red-500">*</span></label>
              <div className="relative">
                <select value={form.status} onChange={set("status")} className={selectCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                {chevron}
              </div>
            </div>
          </section>

          {/* Password Management */}
          <section className="pt-2 border-t border-outline-variant/15">
            <div className="flex items-center gap-2 mb-4 mt-4">
              <span className="material-symbols-outlined text-on-surface" style={fillStyle}>lock</span>
              <h4 className="font-bold text-on-surface">Password Management</h4>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={resetPw} onChange={(e) => setResetPw(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
              <span>
                <span className="block text-sm font-bold text-on-surface">Reset Password</span>
                <span className="block text-[12px] text-on-surface-variant">Check this option to reset the user's password.</span>
              </span>
            </label>

            {resetPw && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
                <div>
                  <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">New Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter new password" className={`${inputBase} pr-10`} />
                    {eye(showPw, () => setShowPw((s) => !s))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Confirm Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className={`${inputBase} pr-10`} />
                    {eye(showConfirm, () => setShowConfirm((s) => !s))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-on-surface-variant border border-outline-variant/40 hover:bg-surface-container">
            Cancel
          </button>
          {/* Save Changes -> submit() validates + updateUser(); onSaved() reloads the list */}
          <button onClick={submit} disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-bold bg-primary text-white shadow-sm hover:shadow-lg disabled:opacity-60 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">save</span>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const schoolYearLabel = useSchoolYear();

  const [searchInput, setSearchInput] = useState("");   // raw search box text (debounced into `search`)
  const [search, setSearch]   = useState("");            // debounced search term sent to the API
  const [role, setRole]       = useState("all");         // role filter
  const [status, setStatus]   = useState("all");         // active/inactive filter
  const [page, setPage]       = useState(1);

  const [data, setData]       = useState(null);          // API response { users, stats, total, totalPages }
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [menuOpen, setMenuOpen]   = useState(null);   // user_id of open row menu
  const [showAdd, setShowAdd]     = useState(false);
  const [editUser, setEditUser]   = useState(null);   // user being edited
  const [banner, setBanner]       = useState("");     // success toast text
  const [busyId, setBusyId]       = useState(null);   // row being toggled
  const [confirmUser, setConfirmUser] = useState(null); // user pending deactivate confirmation

  // debounce the search box
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // fetch the current page of users; re-runs whenever a filter or the page changes
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchUsers({ search, role, status, page, pageSize: PAGE_SIZE })   // GET /admin/users
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message ?? "Failed to load users."))
      .finally(() => setLoading(false));
  }, [search, role, status, page]);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats ?? {};                        // the top stat cards
  const users = data?.users ?? [];                        // this page's rows
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1; // "Showing X to Y" numbers
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  // flip one user's active flag, show a toast, then reload
  const toggleActive = async (u) => {
    setMenuOpen(null);
    setBusyId(u.user_id);                                 // disables that row while in flight
    try {
      await setUserActive(u.user_id, !u.is_active);
      setBanner(`${u.name} ${u.is_active ? "deactivated" : "activated"}.`);
      load();
    } catch (err) {
      setError(err.message ?? "Failed to update user.");
    } finally {
      setBusyId(null);
    }
  };

  // after AddUserModal creates a user: toast the generated login ID + reload page 1
  const onCreated = (created) => {
    setShowAdd(false);
    setBanner(`User created — login ID ${created.school_id ?? "—"}.`);
    setPage(1);
    load();
  };

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  const selectCls = "appearance-none bg-white border border-outline-variant/30 rounded-lg pl-3.5 pr-9 py-2.5 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer";

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full" onClick={() => setMenuOpen(null)}>

        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">User Management</h2>
            <p className="text-on-surface-variant mt-1">Manage all user accounts and roles.</p>
          </div>
          {/* Add New User -> setShowAdd(true) opens <AddUserModal> (rendered at the bottom) */}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-white font-bold rounded-xl shadow-sm hover:shadow-lg transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Add New User
          </button>
        </header>

        {banner && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{banner}
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {loading && !data
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            : STAT_CARDS.map((c) => (
                <div key={c.key} className="bg-white rounded-2xl p-5 border border-outline-variant/20 shadow-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.iconBg}`}>
                    <span className={`material-symbols-outlined text-lg ${c.iconColor}`} style={fillStyle}>{c.icon}</span>
                  </div>
                  <p className="text-[17px] font-bold text-on-surface-variant mb-1">{c.label}</p>
                  <p className="font-headline text-2xl font-extrabold text-on-surface">{stats[c.key] ?? 0}</p>
                </div>
              ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-4 mb-4 flex flex-col md:flex-row gap-3">
          {/* search box -> setSearchInput (debounced into `search` -> load()) */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, role, or status…"
              className="w-full pl-11 pr-10 py-2.5 bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm text-on-surface placeholder:text-outline"
            />
            {/* clear (×) -> empty the box + reset paging + refetch */}
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
                aria-label="Clear search"
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none"
              >close</button>
            )}
          </div>
          {/* role filter -> setRole + setPage(1) -> load() */}
          <div className="relative">
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={selectCls}>
              {ROLE_FILTERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 pointer-events-none text-lg leading-none text-on-surface-variant">expand_more</span>
          </div>
          {/* status filter -> setStatus + setPage(1) -> load() */}
          <div className="relative">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 pointer-events-none text-lg leading-none text-on-surface-variant">expand_more</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/20 text-[15px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-6 py-3.5 font-bold">Name</th>
                <th className="px-6 py-3.5 font-bold">Role</th>
                <th className="px-6 py-3.5 font-bold">Email</th>
                <th className="px-6 py-3.5 font-bold">Status</th>
                <th className="px-6 py-3.5 font-bold">Last Login</th>
                <th className="px-6 py-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={6} className="px-6 py-4"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-on-surface-variant">No users match your filters.</td></tr>
              ) : (
                // `users` (this page's rows) -> one row each
                users.map((u) => (
                  <tr key={u.user_id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-xs shrink-0">
                          {(u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "") || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-surface leading-tight truncate">{lastFirst(u)}</p>
                          <p className="text-[11px] text-on-surface-variant">ID {u.school_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{u.email}</td>
                    <td className="px-6 py-4"><StatusBadge active={u.is_active} /></td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap">{formatLastLogin(u.last_login)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1 relative">
                        {/* Edit (pencil) -> setEditUser(u) opens <EditUserModal> */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setEditUser(u); }}
                          disabled={busyId === u.user_id}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-50"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        {/* More (kebab) -> setMenuOpen toggles this row's dropdown */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === u.user_id ? null : u.user_id); }}
                          disabled={busyId === u.user_id}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-50"
                          title="More"
                        >
                          <span className="material-symbols-outlined text-lg">more_vert</span>
                        </button>

                        {menuOpen === u.user_id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl border border-outline-variant/20 shadow-xl py-1"
                          >
                            {/* Deactivate asks first; Activate is direct */}
                            <button
                              onClick={() => { setMenuOpen(null); if (u.is_active) setConfirmUser(u); else toggleActive(u); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-surface-container-lowest text-left text-on-surface"
                            >
                              <span className="material-symbols-outlined text-base">{u.is_active ? "person_off" : "check_circle"}</span>
                              {u.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          {/* Pagination -> setPage(prev/exact/next); page change re-runs load() */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/20">
            <p className="text-sm text-on-surface-variant">
              {total === 0 ? "No users" : `Showing ${rangeStart} to ${rangeEnd} of ${total} users`}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {buildPageList(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-on-surface-variant text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold ${
                      p === page ? "bg-primary text-white" : "border border-outline-variant/30 text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* modals: `showAdd` -> AddUserModal (onCreated adds the user); `editUser` -> EditUserModal (onSaved reloads) */}
      <ConfirmModal
        open={!!confirmUser}
        tone="danger"
        icon="person_off"
        title="Deactivate User?"
        detail="They will be blocked from signing in."
        message={confirmUser ? `Deactivate ${confirmUser.name}'s account? They will not be able to log in until reactivated.` : ""}
        confirmLabel="Deactivate"
        busy={busyId === confirmUser?.user_id}
        onConfirm={async () => { const u = confirmUser; await toggleActive(u); setConfirmUser(null); }}
        onCancel={() => setConfirmUser(null)}
      />
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={onCreated} />}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(name) => { setEditUser(null); setBanner(`${name} updated.`); load(); }}
        />
      )}
    </AdminLayout>
  );
}
