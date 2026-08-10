// System Configuration (sysadmin): two tabs - School Year Management (list/create/edit/
// activate school years) and User Access Management (list users + toggle active status).
// Backend chain (frontend api/admin.js -> routes/admin.routes.js, mounted at /admin):
//   school years list: GET  /admin/school-years              -> controllers/schoolYear.controller.js > list (~line 6)     -> services/schoolYear.service.js > listSchoolYears (~line 3)
//   create:            POST /admin/school-years              -> controllers/schoolYear.controller.js > create (~line 11)  -> services/schoolYear.service.js > createSchoolYear (~line 9)
//   edit:              PUT  /admin/school-years/:id          -> controllers/schoolYear.controller.js > update (~line 23)  -> services/schoolYear.service.js > updateSchoolYear (~line 24)
//   activate:          POST /admin/school-years/:id/activate -> controllers/schoolYear.controller.js > activate (~line 36) -> services/schoolYear.service.js > activateSchoolYear (~line 39)
//   user access:       GET  /admin/users + PATCH /admin/users/:id/status -> controllers/adminUsers.controller.js > getUsers (~line 6) / updateUserStatus (~line 12) -> services/adminUsers.service.js > listUsers (~line 88) / setUserActive (~line 181)
import { useState, useEffect, useRef } from "react";
import AdminLayout from "../../components/AdminLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import {fetchSchoolYears, createSchoolYear, updateSchoolYear, activateSchoolYear,fetchUsers, setUserActive,} from "../../api/admin.js";
import { fetchAcademicConfig, deleteGradeLevel } from "../../api/settings.js";
import AddGradeLevelModal from "../../components/AddGradeLevelModal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const USER_PAGE_SIZE = 8;

// the page's two tabs
const TABS = [
  { key: "school", label: "School Year Management", icon: "calendar_month" },
  { key: "access", label: "User Access Management",  icon: "manage_accounts" },
];

// role value -> label + pill colour (teacher shows as "Supervisor")
const ROLE_BADGE = {
  principal:     { label: "Principal",     cls: "bg-orange-100 text-orange-700" },
  administrator: { label: "Administrator", cls: "bg-purple-100 text-purple-700" },
  teacher:       { label: "Supervisor",    cls: "bg-blue-100 text-blue-700"     },
  student:       { label: "Student",       cls: "bg-amber-100 text-amber-700"   },
};

const ROLE_FILTERS = [
  { value: "all",           label: "All Roles"    },
  { value: "administrator", label: "Administrator" },
  { value: "principal",     label: "Principal"    },
  { value: "teacher",       label: "Supervisor"   },
  { value: "student",       label: "Student"      },
];

// "Month Day, Year" for display; falls back to the raw string if unparseable
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
// last-login timestamp for the access table, or "Never" if none/invalid
const fmtDateTime = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Never" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const toInputDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : ""); // ISO -> yyyy-mm-dd for <input type=date>
const syLabel = (label) => (label ? (/^sy\s/i.test(label) ? label : `SY ${label}`) : "—"); // ensure a leading "SY " prefix

const Skeleton = ({ className }) => <div className={`animate-pulse bg-surface-container-high rounded-lg ${className}`} />;

const inputCls = "rounded-lg border border-outline-variant/40 px-3 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low cursor-pointer bg-white";
const labelCls = "block text-[15px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5";

// ── Edit School Year modal ────────────────────────────────────────────────────
// Small modal to rename a school year or adjust its start/end dates.
// Rendered by <SchoolYearTab> (editing). onClose = () => setEditing(null);
// onSaved = () => { setEditing(null); setBanner("School year updated."); reload(); }.
function EditSchoolYearModal({ sy, onClose, onSaved }) {
  const [form, setForm] = useState({                 // seeded from the row being edited
    year_label: sy.year_label ?? "",
    start_date: toInputDate(sy.start_date),          // ISO -> yyyy-mm-dd for the date inputs
    end_date:   toInputDate(sy.end_date),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value })); // curried onChange per field

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.year_label.trim() || !form.start_date || !form.end_date) return setError("All fields are required.");
    setSaving(true);
    try {
      await updateSchoolYear(sy.sy_id, form);        // PATCH /admin/school-years/:id
      onSaved();                                     // parent closes + reloads
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Failed to update.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-outline-variant/15">
          <h3 className="font-headline text-xl font-extrabold text-on-surface">Edit School Year</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}
          <div>
            <label className={labelCls}>School Year Label</label>
            <input value={form.year_label} onChange={set("year_label")} placeholder="e.g., SY 2026-2027" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={form.start_date} onChange={set("start_date")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={form.end_date} onChange={set("end_date")} className={inputCls} />
            </div>
          </div>
        </form>
        {/* Cancel -> onClose; Save Changes -> submit() (updateSchoolYear, then onSaved) */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-on-surface-variant border border-outline-variant/40 hover:bg-surface-container">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-bold bg-primary text-white shadow-sm hover:shadow-lg disabled:opacity-60">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── School Year Management tab ─────────────────────────────────────────────────
// Lists all school years, lets the admin create one, edit one, or mark one active.
function SchoolYearTab({ setBanner }) {
  const [years, setYears]     = useState([]);        // all school year records
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [reloadKey, setReloadKey] = useState(0);     // bump to refetch the list
  const [editing, setEditing] = useState(null);      // school year open in the edit modal
  const [form, setForm]       = useState({ year_label: "", start_date: "", end_date: "" }); // create form
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId]   = useState(null);      // sy_id currently being activated
  const [confirmSy, setConfirmSy] = useState(null);  // school year pending "set active" confirmation
  const [gradeLevels, setGradeLevels] = useState([]); // grade levels for the active year
  const [glLoading, setGlLoading]     = useState(true);
  const [showAddGl, setShowAddGl]     = useState(false); // Add Grade Level modal open?
  const [confirmGl, setConfirmGl]     = useState(null);  // grade level pending delete confirmation
  const [deletingGl, setDeletingGl]   = useState(null);  // gl_id currently being deleted

  const reload = () => setReloadKey((k) => k + 1);

  // (re)load the active year's grade levels alongside the school-year list
  useEffect(() => {
    const loadGl = async () => {
      setGlLoading(true);
      try {
        const res = await fetchAcademicConfig();
        setGradeLevels(res.data?.gradeLevels ?? []);
      } catch {
        setGradeLevels([]);
      } finally {
        setGlLoading(false);
      }
    };
    loadGl();
  }, [reloadKey]);

  const nextGlOrder = gradeLevels.length
    ? Math.max(...gradeLevels.map((g) => g.level_order ?? 0)) + 1
    : 1;

  // (re)load the school year list whenever reloadKey changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchSchoolYears();          // GET /admin/school-years
        setYears(res.data ?? []);
      } catch (err) {
        setError(err.response?.data?.message ?? err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reloadKey]);

  const active = years.find((y) => y.is_active) ?? null; // the one active year (at most one)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value })); // curried onChange per create field

  // create a new school year from the form
  const onCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.year_label.trim() || !form.start_date || !form.end_date) { setError("Fill in all fields to create a school year."); return; }
    setCreating(true);
    try {
      await createSchoolYear(form);                    // POST /admin/school-years
      setForm({ year_label: "", start_date: "", end_date: "" }); // clear the form
      setBanner("School year created.");
      reload();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setCreating(false);
    }
  };

  // mark one school year active (the backend deactivates the others)
  const onActivate = async (sy) => {
    setBusyId(sy.sy_id);
    try {
      await activateSchoolYear(sy.sy_id);              // PATCH /admin/school-years/:id/activate
      setBanner(`${syLabel(sy.year_label)} is now active.`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setBusyId(null);
    }
  };

  // delete a grade level. The DB blocks this (FK) if students or a supervisor are
  // still attached, so we surface that message instead of silently failing.
  const onDeleteGl = async (g) => {
    setError("");
    setDeletingGl(g.gl_id);
    try {
      await deleteGradeLevel(g.gl_id);               // DELETE /settings/academic/grade-levels/:id
      setBanner(`${g.level_name} removed.`);
      reload();
    } catch (err) {
      setError(
        err.response?.data?.message ??
        `Cant delete ${g.level_name}. Students or supervisor still assigned.`
      );
    } finally {
      setDeletingGl(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>{error}
        </div>
      )}

    <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined" style={fillStyle}>
              event_available
            </span>
          </div>
          <h3 className="font-headline text-lg font-extrabold text-on-surface flex items-center gap-2">
            Current School Year
            {active && (
              <span className="text-[10px] font-extrabold tracking-widest uppercase bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </h3>
        </div>

        {active && (
          <button
            onClick={() => setEditing(active)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-base">edit</span>
            Edit Active School Year
          </button>
        )}
      </div>

      {/* School Year Details */}
      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : !active ? (
        <p className="text-sm text-on-surface-variant">
          No active school year set. Set one as active below.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <p className={labelCls}>School Year</p>
            <div className={`rounded-lg border border-outline-variant/40 pl-4 pr-10 py-2.5 text-sm font-bold text-on-surface-variant  bg-white bg-surface-container-lowest`}>
              {syLabel(active.year_label)}
            </div>
          </div>

          <div>
            <p className={labelCls}>Start Date</p>
            <div className={`rounded-lg border border-outline-variant/40 pl-4 pr-10 py-2.5 text-sm font-bold text-on-surface-variant  bg-white bg-surface-container-lowest`}>
              {fmtDate(active.start_date)}
            </div>
          </div>

          <div>
            <p className={labelCls}>End Date</p>
            <div className={`rounded-lg border border-outline-variant/40 pl-4 pr-10 py-2.5 text-sm font-bold text-on-surface-variant  bg-white bg-surface-container-lowest`}>
              {fmtDate(active.end_date)}
            </div>
          </div>

          <span className="text-[10px] font-extrabold tracking-widest uppercase bg-green-100 text-green-700 px-3 py-2 rounded-lg text-center">
            Active
          </span>
        </div>
      )}


      {/* Divider */}
      <div className="my-6 border-t border-outline-variant/20" />

      {/* Grade Levels */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined" style={fillStyle}>
              inventory_2
            </span>
          </div>

          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">
              Grade Levels
            </h3>
            <p className="text-sm text-on-surface-variant">
              Grade levels for the active school year.
            </p>
          </div>
        </div>

        {/* A school year supports at most 12 grade levels (matches the backend check in
            settings.service.js > addGradeLevel) — disable the button at the cap instead
            of letting the principal/admin hit a server error. */}
        <button
          onClick={() => setShowAddGl(true)}
          disabled={gradeLevels.length >= 12}
          title={gradeLevels.length >= 12 ? "Maximum of 12 grade levels reached." : undefined}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add Grade Level
        </button>
      </div>

      {gradeLevels.length >= 12 && (
        <p className="text-xs text-amber-600 font-semibold mb-3">Maximum of 12 grade levels reached.</p>
      )}

      {glLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : gradeLevels.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No grade levels yet. Use "Add Grade Level" to create one.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {gradeLevels.map((g) => (
            <span
              key={g.gl_id}
              className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full bg-surface-container-high text-on-surface text-sm font-bold"
            >
              {g.level_name}

              <button
                onClick={() => setConfirmGl(g)}
                disabled={deletingGl === g.gl_id}
                aria-label={`Remove ${g.level_name}`}
                title={`Remove ${g.level_name}`}
                className="flex items-center justify-center w-5 h-5 rounded-full text-on-surface-variant hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base leading-none">
                  close
                </span>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 text-[13px]">
        <span
          className="material-symbols-outlined text-base shrink-0"
          style={fillStyle}
        >
          info
        </span>
        Only one school year can be active at a time. The active school year is
        used across all modules and reports.
      </div>
    </div>

      {/* Add New School Year */}
      <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
            <span className="material-symbols-outlined">add</span>
          </div>
          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Add New School Year</h3>
            <p className="text-sm text-on-surface-variant">Create a new school year for future academic use.</p>
          </div>
        </div>
        {/* create form: inputs -> set(field); submit -> onCreate() (createSchoolYear + reload) */}
        <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div><label className={labelCls}>School Year Label</label><input value={form.year_label} onChange={set("year_label")} placeholder="e.g., SY 2026-2027" className={inputCls} /></div>
          <div><label className={labelCls}>Start Date</label><input type="date" value={form.start_date} onChange={set("start_date")} className={inputCls} /></div>
          <div><label className={labelCls}>End Date</label><input type="date" value={form.end_date} onChange={set("end_date")} className={inputCls} /></div>
          <button type="submit" disabled={creating} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-primary text-white shadow-sm hover:shadow-lg disabled:opacity-60">
            <span className="material-symbols-outlined text-base">add</span>{creating ? "Creating…" : "Create School Year"}
          </button>
        </form>
      </div>


      {showAddGl && (
        <AddGradeLevelModal
          nextOrder={nextGlOrder}
          onClose={() => setShowAddGl(false)}
          onSuccess={() => { setShowAddGl(false); setBanner("Grade level added."); reload(); }}
        />
      )}

      {/* School Year Records */}
      <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <h3 className="font-headline text-lg font-extrabold text-on-surface">School Year Records</h3>
          <p className="text-sm text-on-surface-variant">View and manage all school year records.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[15px] font-extrabold tracking-widest uppercase text-on-surface-variant bg-surface-container/30 border-y border-outline-variant/20">
                <th className="px-6 py-3 text-left">School Year</th>
                <th className="px-6 py-3 text-left">Start Date</th>
                <th className="px-6 py-3 text-left">End Date</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>)}</tr>
                ))
              ) : years.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-on-surface-variant">No school year records yet.</td></tr>
              ) : (
                years.map((sy) => (
                  <tr key={sy.sy_id} className="hover:bg-surface-container-lowest">
                    <td className="px-6 py-4 text-sm font-bold text-on-surface">{syLabel(sy.year_label)}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{fmtDate(sy.start_date)}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{fmtDate(sy.end_date)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${sy.is_active ? "bg-green-100 text-green-700" : "bg-surface-container-high text-on-surface-variant"}`}>
                        {sy.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {sy.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-bold">
                            <span className="material-symbols-outlined text-sm">check</span> Current Active
                          </span>
                        ) : (
                          /* Set as Active -> confirm, then onActivate(sy) (activateSchoolYear + reload) */
                          <button onClick={() => setConfirmSy(sy)} disabled={busyId === sy.sy_id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface text-xs font-bold hover:bg-surface-container-low disabled:opacity-60">
                            <span className="material-symbols-outlined text-sm">star</span> Set as Active
                          </button>
                        )}
                        {/* Edit -> setEditing(sy) opens <EditSchoolYearModal> */}
                        <button onClick={() => setEditing(sy)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface text-xs font-bold hover:bg-surface-container-low">
                          <span className="material-symbols-outlined text-sm">edit</span> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-outline-variant/10 text-sm text-on-surface-variant">
          {loading ? "Loading…" : `Showing 1 to ${years.length} of ${years.length} records`}
        </div>
      </div>

      {/* `editing` (set by Edit buttons) -> EditSchoolYearModal; onSaved reloads the list */}
      {editing && (
        <EditSchoolYearModal
          sy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setBanner("School year updated."); reload(); }}
        />
      )}

      <ConfirmModal
        open={!!confirmSy}
        tone="primary"
        icon="event_available"
        title="Set Active School Year?"
        message={confirmSy ? `Make ${syLabel(confirmSy.year_label)} the active school year? This deactivates the current active year and changes what the whole system treats as the current year.` : ""}
        confirmLabel="Set as Active"
        busy={busyId === confirmSy?.sy_id}
        onConfirm={async () => { const sy = confirmSy; await onActivate(sy); setConfirmSy(null); }}
        onCancel={() => setConfirmSy(null)}
      />

      <ConfirmModal
        open={!!confirmGl}
        tone="danger"
        icon="delete"
        title="Remove Grade Level?"
        message={confirmGl ? `Remove ${confirmGl.level_name} from the active school year? This can't be undone, and it will be blocked if any students or a supervisor are still assigned to it.` : ""}
        confirmLabel="Remove"
        busy={deletingGl === confirmGl?.gl_id}
        onConfirm={async () => { const g = confirmGl; await onDeleteGl(g); setConfirmGl(null); }}
        onCancel={() => setConfirmGl(null)}
      />
    </div>
  );
}

// ── User Access Management tab ─────────────────────────────────────────────────
// Reuses the /admin/users list to toggle each user's active status (per row, or via a
// pending dropdown edit + Save).
function UserAccessTab({ setBanner }) {
  const [searchInput, setSearchInput] = useState(""); // raw search text (debounced into `search`)
  const [search, setSearch] = useState("");            // debounced term sent to the API
  const [role, setRole]     = useState("all");         // role filter
  const [status, setStatus] = useState("all");         // active/inactive filter
  const [page, setPage]     = useState(1);
  const [data, setData]     = useState(null);          // API response { users, stats, total, totalPages }
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [statusEdits, setStatusEdits] = useState({}); // user_id -> "active"|"inactive" (unsaved dropdown edits)
  const [busyId, setBusyId] = useState(null);          // row currently saving
  const [confirmUser, setConfirmUser] = useState(null); // user pending deactivate confirmation
  const [reloadKey, setReloadKey] = useState(0);       // bump to refetch

  // debounce the search box
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // (re)load the current page of users; clears any pending edits on fresh data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchUsers({ search, role, status, page, pageSize: USER_PAGE_SIZE }); // GET /admin/users
        setData(res.data);
        setStatusEdits({});                            // discard unsaved dropdown edits after a reload
      } catch (err) {
        setError(err.response?.data?.message ?? err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [search, role, status, page, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const users = data?.users ?? [];                     // this page's rows
  const stats = data?.stats ?? {};
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const totalRoles = ["administrators", "teachers", "students", "principals"].filter((k) => (stats[k] ?? 0) > 0).length; // # of roles that have any users

  const statCards = [
    { label: "Total Users",    value: stats.totalUsers,    icon: "groups",        bg: "bg-blue-100",   color: "text-blue-600",  sub: "All system users" },
    { label: "Active Users",   value: stats.activeUsers,   icon: "check_circle",  bg: "bg-green-100",  color: "text-green-600", sub: "Currently active" },
    { label: "Inactive Users", value: stats.inactiveUsers, icon: "person_off",    bg: "bg-orange-100", color: "text-orange-600",sub: "Currently inactive" },
    { label: "Total Roles",    value: totalRoles,          icon: "shield_person", bg: "bg-purple-100", color: "text-purple-600",sub: "System roles" },
  ];

  const rowStatus = (u) => statusEdits[u.user_id] ?? (u.is_active ? "active" : "inactive"); // pending edit, else saved value
  const dirty = (u) => rowStatus(u) !== (u.is_active ? "active" : "inactive");               // dropdown differs from saved -> enable Save

  // commit a row's pending dropdown status via Save Changes
  const saveStatus = async (u) => {
    setBusyId(u.user_id);
    try {
      await setUserActive(u.user_id, rowStatus(u) === "active"); // PATCH /admin/users/:id/status
      setBanner(`${u.name} updated.`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setBusyId(null);
    }
  };

  // one-click flip of a user's active flag (the Deactivate/Activate button)
  const toggleActive = async (u) => {
    setBusyId(u.user_id);
    try {
      await setUserActive(u.user_id, !u.is_active);
      setBanner(`${u.name} ${u.is_active ? "deactivated" : "activated"}.`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => { setSearchInput(""); setSearch(""); setRole("all"); setStatus("all"); setPage(1); }; // reset all filters

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>{error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-5 border border-outline-variant/20 shadow-sm flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.bg} ${c.color}`}>
              <span className="material-symbols-outlined" style={fillStyle}>{c.icon}</span>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">{c.label}</p>
              {loading && !data ? <Skeleton className="h-7 w-12 mt-1" /> : <p className="font-headline text-2xl font-extrabold text-on-surface">{c.value ?? 0}</p>}
              <p className="text-[13px] text-on-surface-variant">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters: search -> setSearchInput; role/status -> setRole/setStatus (+ page 1); Clear -> clearFilters() */}
      <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-outline text-lg">search</span>
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name or email…" className={`${inputCls} pl-10 pr-10`} />
          {/* clear (×) -> empty the box + reset paging + refetch */}
          {searchInput && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              aria-label="Clear search"
              className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1 text-base text-outline hover:text-on-surface cursor-pointer leading-none"
            >close</button>
          )}
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={`${inputCls} w-auto cursor-pointer`}>
          {ROLE_FILTERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${inputCls} w-auto cursor-pointer`}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={clearFilters} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-outline-variant/40 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low">
          <span className="material-symbols-outlined text-base">close</span> Clear Filters
        </button>
      </div>

      {/* User Access List */}
      <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <h3 className="font-headline text-lg font-extrabold text-on-surface">User Access List</h3>
          <p className="text-sm text-on-surface-variant">View and manage user access, roles, and account status.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[15px] font-extrabold tracking-widest uppercase text-on-surface-variant bg-surface-container/30 border-y border-outline-variant/20">
                <th className="px-6 py-3 text-left">Full Name</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Role</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Last Login</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>)}</tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-on-surface-variant">No users match the current filters.</td></tr>
              ) : (
                // one row per user: role badge, editable status dropdown, and action buttons
                users.map((u) => {
                  const badge = ROLE_BADGE[u.role] ?? { label: u.role, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={u.user_id} className="hover:bg-surface-container-lowest align-top">
                      <td className="px-6 py-4 text-sm font-bold text-on-surface">{u.name}</td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      {/* status dropdown -> setStatusEdits (pending edit for this row) */}
                      <td className="px-6 py-4">
                        <div className="relative inline-block">
                          <select
                            value={rowStatus(u)}
                            onChange={(e) =>
                              setStatusEdits((m) => ({ ...m, [u.user_id]: e.target.value }))
                            }
                            className="appearance-none border border-outline-variant/40 rounded-lg pl-3 pr-9 py-1 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer bg-white"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>

                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                            <span className="material-symbols-outlined text-base">
                              expand_more
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-on-surface-variant whitespace-nowrap">{fmtDateTime(u.last_login)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Save Changes -> saveStatus(u) commits the dropdown edit; enabled only when dirty(u) */}
                          <button
                            onClick={() => saveStatus(u)}
                            disabled={busyId === u.user_id || !dirty(u)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-[11px] font-bold hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-sm">save</span> Save Changes
                          </button>
                          {/* Deactivate/Activate -> deactivate asks first; activate is direct */}
                          <button
                            onClick={() => (u.is_active ? setConfirmUser(u) : toggleActive(u))}
                            disabled={busyId === u.user_id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-60 ${u.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                          >
                            <span className="material-symbols-outlined text-sm">{u.is_active ? "block" : "check_circle"}</span>
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/10">
          <p className="text-sm text-on-surface-variant">
            {total === 0 ? "No users" : `Showing ${(page - 1) * USER_PAGE_SIZE + 1} to ${Math.min(page * USER_PAGE_SIZE, total)} of ${total} users`}
          </p>
          {/* pager -> setPage; page change re-runs the user-access load() */}
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold ${p === page ? "bg-primary text-white" : "border border-outline-variant/30 text-on-surface hover:bg-surface-container"}`}>{p}</button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmUser}
        tone="danger"
        icon="block"
        title="Deactivate User?"
        detail="They will be blocked from signing in."
        message={confirmUser ? `Deactivate ${confirmUser.name}'s account? They will not be able to log in until reactivated.` : ""}
        confirmLabel="Deactivate"
        busy={busyId === confirmUser?.user_id}
        onConfirm={async () => { const u = confirmUser; await toggleActive(u); setConfirmUser(null); }}
        onCancel={() => setConfirmUser(null)}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
// Shell: header + banner + tab switcher; the two tabs own their own data.
export default function SystemConfiguration() {
  const schoolYearLabel = useSchoolYear();
  const [tab, setTab] = useState("school");   // active tab
  const [banner, setBanner] = useState("");   // shared success toast (set by either tab)

  useEffect(() => {                            // auto-dismiss the success banner
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">
        <header className="mb-6">
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">System Configuration</h2>
          <p className="text-on-surface-variant mt-1">Manage school year records and user access settings.</p>
        </header>

        {banner && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{banner}
          </div>
        )}

        {/* Tabs -> setTab(key) switches between <SchoolYearTab> and <UserAccessTab> */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm px-4 mb-6">
          <div className="flex items-center gap-6">
            {TABS.map((t) => {
              const activeTab = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative flex items-center gap-2 py-4 text-sm font-bold transition-colors ${activeTab ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
                  <span className="material-symbols-outlined text-lg" style={activeTab ? fillStyle : undefined}>{t.icon}</span>
                  {t.label}
                  {activeTab && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* render the active tab (each fetches its own data) */}
        {tab === "school" ? <SchoolYearTab setBanner={setBanner} /> : <UserAccessTab setBanner={setBanner} />}
      </main>
    </AdminLayout>
  );
}
