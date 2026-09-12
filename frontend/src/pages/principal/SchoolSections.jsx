// School Grade Levels / Sections (principal): grid of grade-level cards; per card you
// can enroll students, assign a supervisor, or view details.
// Backend chain (frontend api/sections.js -> routes/section.routes.js, mounted at /grade-levels):
//   list:   GET  /grade-levels           -> controllers/section.controller.js > getAll (~line 5)          -> services/section.service.js > getAllGradeLevels (~line 13)
//   enroll: POST /grade-levels/:id/students -> controllers/section.controller.js > enrollStudents (~line 10) -> services/section.service.js > enrollStudents (~line 55)
//   assign: POST /grade-levels/:id/teacher  -> controllers/section.controller.js > assignTeacher (~line 16)  -> services/section.service.js > assignTeacher (~line 72)
//   unassign: DELETE /grade-levels/:id/teacher/:teacherId -> controllers/section.controller.js > unassignTeacher -> services/section.service.js > unassignTeacher
//   remove: DELETE /grade-levels/:id/students/:studentId -> controllers/section.controller.js > removeStudent -> services/section.service.js > removeStudent
//   modals also read api/student.js fetchAllStudents + api/teacher.js fetchAllTeachers.
import { useState, useEffect, useCallback } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchAllSections, enrollStudentsInLevel, removeStudentFromLevel, assignTeacherToSection, unassignTeacherFromSection } from "../../api/sections.js";
import { fetchAllStudents } from "../../api/student.js";
import { fetchAllTeachers } from "../../api/teacher.js";
import AddGradeLevelModal from "../../components/AddGradeLevelModal.jsx";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const AVATAR_PALETTE = [
  "bg-primary      text-white",
  "bg-amber-500    text-white",
  "bg-slate-600    text-white",
  "bg-emerald-600  text-white",
  "bg-rose-500     text-white",
  "bg-violet-600   text-white",
  "bg-sky-600      text-white",
];
// deterministic avatar colour from a string (same name -> same colour)
const avatarBg = (str = "") => {
  const code = [...str].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};
// first two initials from a name, uppercased
const initials = (name = "") =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

// "Month D, YYYY" date, or em dash if missing/invalid
const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

// ─── Grade Level Card ─────────────────────────────────────────────────────────
// One action button in the card's footer (Manage / Assign / View).
function CardAction({ icon, label, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-bold transition-colors ${
        primary
          ? "text-white hover:bg-primary/90"
          : "text-on-surface-variant hover:bg-surface-container-lowest"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}

// One grade-level tile: label, student count, assigned supervisor, and 3 actions.
function GradeLevelCard({ level, onManageStudents, onAssignSupervisor, onView }) {
  const supervisors = level.faculty ?? [];
  const headline    = supervisors[0]?.name ?? null; // primary supervisor shown on the card
  const extra       = supervisors.length - 1;        // "+N more" count

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 flex flex-col overflow-hidden">
      <div className="p-5 flex-1 ">
        {/* Grade label + student count */}
        <div className="flex items-start justify-between mb-5">
          <span className="text-[20px] font-extrabold tracking-widest uppercase bg-blue-100 text-on-surface-variant px-2.5 py-1 rounded-lg">
            {level.grade}
          </span>
          <div className="text-right leading-none">
            <p className="font-headline text-2xl font-extrabold text-on-surface">{level.students}</p>
            <p className="text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant mt-1">Students</p>
          </div>
        </div>

        {/* Assigned supervisor */}
        <p className="text-[13px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">
          Assigned Supervisor
        </p>
        <div className="flex items-center justify-between gap-2">
          {headline ? (
            <span className="text-xl font-black text-on-surface truncate">
              {headline}
              {extra > 0 && <span className="text-on-surface-variant font-medium"> +{extra} more</span>}
            </span>
          ) : (
            <span className="text-sm text-on-surface-variant">No supervisor assigned</span>
          )}
          {headline && (
            <span className="text-[13px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
              Assigned
            </span>
          )}
        </div>
      </div>

      {/* Action footer: Manage -> onManageStudents (Enroll modal); Assign -> onAssignSupervisor; View -> onView (all set page-level state) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-outline-variant/100 divide-x divide-outline-variant/100">
        <CardAction icon="group"      label="Manage" onClick={() => onManageStudents(level)} />
        <CardAction icon="group_add"  label="Assign" onClick={() => onAssignSupervisor(level)} />
        <CardAction icon="visibility" label="View"   onClick={() => onView(level)} />
      </div>
    </div>
  );
}

// ─── Enroll Students Modal ────────────────────────────────────────────────────
// Pick students (searchable + filterable, multi-select) to enroll into this level.
// Rendered by <SchoolSections> (enrollTarget). onClose = () => setEnrollTarget(null);
// onConfirm = handleEnroll (calls enrollStudentsInLevel, then reloads).
function EnrollStudentsModal({ level, onClose, onConfirm }) {
  const [search,      setSearch]      = useState("");
  const [students,    setStudents]    = useState([]);
  const [selected,    setSelected]    = useState(new Set()); // chosen student_ids
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [saveError,   setSaveError]   = useState(null); // error surfaced from the enroll call

  // load all students to choose from
  useEffect(() => {
    fetchAllStudents()
      .then((res) => setStudents(res.data?.data ?? res.data ?? []))
      .catch(() => setError("Failed to load students."))
      .finally(() => setLoading(false));
  }, []);

  // Only students assigned in the active school year are excluded. A student's
  // gl_id may still point to a previous-year grade and must remain enrollable in
  // the newly active year.
  const previousGradeFor = (student) => student.previous_grade_level ?? (
    Number(student.grade_level?.sy_id) !== Number(level.sy_id)
      ? student.grade_level?.level_name
      : null
  );
  const gradeOrder = (student) => {
    const label = previousGradeFor(student);
    if (!label) return Number.MAX_SAFE_INTEGER;
    const match = String(label).match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER - 1;
  };

  const filtered = students
    .filter((s) => {
      if (Number(s.grade_level?.sy_id) === Number(level.sy_id)) return false;
      const name = `${s.first_name} ${s.last_name}`.toLowerCase();
      return name.includes(search.toLowerCase()) || String(s.student_id).includes(search);
    })
    .sort((a, b) => {
      const byGrade = gradeOrder(a) - gradeOrder(b);
      if (byGrade) return byGrade;
      const nameA = `${a.last_name ?? ""}, ${a.first_name ?? ""}`;
      const nameB = `${b.last_name ?? ""}, ${b.first_name ?? ""}`;
      return nameA.localeCompare(nameB);
    });

  // add/remove one student from the selection
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // select-all / clear-all across the currently filtered rows
  const toggleAll = () =>
    setSelected(
      filtered.every((s) => selected.has(s.student_id))
        ? new Set()
        : new Set(filtered.map((s) => s.student_id))
    );

  // enroll the selected students into this level
  const handleConfirm = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onConfirm(level.id, [...selected]);
    } catch (err) {
      setSaveError(err?.response?.data?.message ?? err?.message ?? "Failed to enroll students.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-primary">Enroll Students</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {level.name} &nbsp;·&nbsp; {selected.size} selected
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">search</span>
            <input
              type="text"
              placeholder="Search by name or student ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary"
            />
            {/* clear (×) -> empty the box */}
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none"
              >close</button>
            )}
          </div>
        </div>

        {/* Helper note: this list is limited to students not yet in a grade */}
        {!loading && !error && (
          <p className="px-6 pb-1 shrink-0 text-[11px] text-on-surface-variant">
            Showing students not yet assigned for the active school year. Previous-year assignments do not prevent enrollment.
          </p>
        )}

        {/* Select-all row */}
        {!loading && !error && filtered.length > 0 && (
          <div className="px-6 py-2 shrink-0 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filtered.every((s) => selected.has(s.student_id))}
                onChange={toggleAll}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-xs font-bold text-on-surface-variant">Select all ({filtered.length})</span>
            </label>
            <span className="text-xs text-on-surface-variant">{filtered.length} unassigned</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-error">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No students found.</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((s) => {
                const id       = s.student_id;
                const checked  = selected.has(id);
                const name     = `${s.first_name} ${s.last_name}`;
                const previousGrade = previousGradeFor(s);
                const previousYear = s.previous_school_year ?? null;
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors border ${
                      checked ? "bg-primary/5 border-primary/20" : "hover:bg-surface-container-lowest border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      className="w-4 h-4 accent-primary rounded shrink-0"
                    />
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${avatarBg(initials(name))}`}>
                      {initials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{name}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        ID: {id}
                      </p>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        <span className="font-bold">Previous Grade Level:</span>{" "}
                        {previousGrade ?? "No previous grade record"}
                        {previousYear ? ` · SY ${String(previousYear).replace(/^SY\s*/i, "")}` : ""}
                      </p>
                    </div>
                    {checked && (
                      <span className="material-symbols-outlined text-primary text-base shrink-0" style={fillStyle}>check_circle</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {saveError && (
          <p className="px-6 pt-3 shrink-0 text-xs font-medium text-error">{saveError}</p>
        )}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
          {/* Enroll -> handleConfirm() -> onConfirm(level.id, [...selected]) = page's handleEnroll() */}
          <button
            disabled={selected.size === 0 || saving}
            onClick={handleConfirm}
            className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors shadow-sm shadow-primary/20 flex items-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
            Enroll {selected.size > 0 ? `${selected.size} Student${selected.size > 1 ? "s" : ""}` : "Students"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Teacher Modal ─────────────────────────────────────────────────────
// Pick one available supervisor (teacher) to assign to this grade level.
// Rendered by <SchoolSections> (assignTarget). onClose = () => setAssignTarget(null);
// onConfirm = handleAssignTeacher (calls assignTeacherToSection, then reloads).
// onUnassign = handleUnassignTeacher (calls unassignTeacherFromSection, then reloads).
// `levels` is the full grade-level list, used to tell which teachers already
// supervise another grade — a teacher may only supervise one grade level.
function AssignTeacherModal({ level, levels, onClose, onConfirm, onUnassign }) {
  const [search,   setSearch]   = useState("");
  const [teachers, setTeachers] = useState([]);       // teachers not already on this level
  const [selected, setSelected] = useState(null);      // chosen teacher_id
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);      // load error (replaces the list)
  const [saveError, setSaveError] = useState(null);    // assign error (shown above the footer)
  const [confirmRemove, setConfirmRemove] = useState(false); // Remove clicked once?
  const [removing, setRemoving] = useState(false);

  const current = level.faculty?.[0] ?? null;          // supervisor currently on this level

  // teacher_id -> name of the OTHER grade level they already supervise
  const assignedElsewhere = new Map();
  (levels ?? []).forEach((l) => {
    if (l.id === level.id) return;
    (l.faculty ?? []).forEach((f) => assignedElsewhere.set(f.id, l.name));
  });

  // load teachers, excluding ones already assigned to this level
  useEffect(() => {
    fetchAllTeachers()
      .then((res) => {
        const all = res.data?.data ?? res.data ?? [];
        const assignedIds = new Set(level.faculty.map((f) => f.id));
        setTeachers(all.filter((t) => !assignedIds.has(t.teacher_id)));
      })
      .catch(() => setError("Failed to load teachers."))
      .finally(() => setLoading(false));
  }, [level]);

  const filtered = teachers.filter((t) =>                // name search
    `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  // assign the selected teacher to this level
  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try { await onConfirm(level.id, selected); }
    catch (err) {
      // surface the backend guardrail (e.g. teacher already supervises another grade)
      setSaveError(err?.response?.data?.message ?? "Failed to assign supervisor.");
    }
    finally { setSaving(false); }
  };

  // clear this level's supervisor (two-step: Remove -> Confirm)
  const handleRemove = async () => {
    if (!current) return;
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setRemoving(true);
    setSaveError(null);
    try { await onUnassign(level.id, current.id); }
    catch (err) {
      setSaveError(err?.response?.data?.message ?? "Failed to remove supervisor.");
      setConfirmRemove(false);
    }
    finally { setRemoving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-5 border-b border-outline-variant/20 flex items-start justify-between shrink-0">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Assign Supervisor – {level.name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Select a supervisor to assign for {level.name}.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Info banner */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
            <span className="material-symbols-outlined text-base shrink-0" style={fillStyle}>info</span>
            Each grade level can have one primary supervisor, and a supervisor can only handle one grade level.
          </div>
        </div>

        {/* Current supervisor + Remove (unassign). Removing clears grade_level.teacher_id,
            which frees this teacher up to be assigned to another grade level. */}
        {current && (
          <div className="px-6 pt-4 shrink-0">
            <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
              Current Supervisor
            </label>
            <div className="mt-1.5 flex items-center gap-3 px-3 py-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${avatarBg(initials(current.name))}`}>
                {initials(current.name)}
              </div>
              <p className="flex-1 min-w-0 text-sm font-bold text-on-surface truncate">{current.name}</p>
              {confirmRemove && !removing && (
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs font-bold text-on-surface-variant hover:underline shrink-0"
                >
                  Cancel
                </button>
              )}
              {/* Remove -> handleRemove() -> onUnassign(level.id, current.id) = page's handleUnassignTeacher() */}
              <button
                onClick={handleRemove}
                disabled={removing}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                  confirmRemove
                    ? "bg-error text-white hover:bg-error/90"
                    : "text-error border border-error/30 hover:bg-error/5"
                }`}
              >
                {removing
                  ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  : <span className="material-symbols-outlined text-sm">person_remove</span>}
                {confirmRemove ? "Confirm Remove" : "Remove"}
              </button>
            </div>
            {confirmRemove && !removing && (
              <p className="mt-1.5 text-[11px] text-on-surface-variant">
                {level.name} will have no supervisor, and {current.name} becomes available for another grade level.
              </p>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <label className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant">
            Select Supervisor <span className="text-error">*</span>
          </label>
          <div className="relative mt-1.5">
            <input
              type="text"
              placeholder="Search supervisor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base pointer-events-none">expand_more</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-error">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">No available supervisors.</p>
          ) : (
            <div className="space-y-1.5 py-2">
              {filtered.map((t) => {
                const name       = `${t.first_name} ${t.last_name}`;
                const subtitle   = t.users?.email ?? t.email ?? null;
                const isSelected = selected === t.teacher_id;
                // already supervising another grade -> not selectable here
                const takenBy    = assignedElsewhere.get(t.teacher_id) ?? null;
                return (
                  <button
                    key={t.teacher_id}
                    disabled={!!takenBy}
                    title={takenBy ? `Already supervising ${takenBy}.` : undefined}
                    onClick={() => setSelected(t.teacher_id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors border text-left ${
                      takenBy
                        ? "opacity-60 cursor-not-allowed border-outline-variant/20"
                        : isSelected
                          ? "bg-primary/5 border-primary/30"
                          : "hover:bg-surface-container-lowest border-outline-variant/20"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-xl shrink-0 ${isSelected && !takenBy ? "text-primary" : "text-on-surface-variant"}`}
                      style={isSelected && !takenBy ? fillStyle : undefined}
                    >
                      {isSelected && !takenBy ? "radio_button_checked" : "radio_button_unchecked"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{name}</p>
                      {subtitle && <p className="text-[11px] text-on-surface-variant truncate">{subtitle}</p>}
                    </div>
                    {takenBy ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full shrink-0 max-w-[45%] truncate">
                        Assigned · {takenBy}
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
                        Available
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {saveError && (
          <p className="px-6 pt-3 shrink-0 text-xs font-medium text-error">{saveError}</p>
        )}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
          {/* Assign Supervisor -> handleConfirm() -> onConfirm(level.id, selected) = page's handleAssignTeacher() */}
          <button
            disabled={!selected || saving}
            onClick={handleConfirm}
            className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-40 transition-colors shadow-sm shadow-primary/20 flex items-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
            Assign Supervisor
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Grade Modal (read-only) ─────────────────────────────────────────────
function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-bold text-on-surface text-right">{children}</span>
    </div>
  );
}

function SummaryStat({ value, label, icon, iconBg, iconColor, valueColor = "text-on-surface" }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={`font-headline text-3xl font-extrabold leading-none ${valueColor}`}>{value}</p>
        <p className="text-[11px] text-on-surface-variant mt-1.5">{label}</p>
      </div>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-lg" style={fillStyle}>{icon}</span>
      </div>
    </div>
  );
}

// Grade-level details: info, gender/status summary, and the enrolled roster with
// a per-student Remove (unassign) action.
// Rendered by <SchoolSections> (viewTarget). onClose = () => setViewTarget(null).
// onChanged = loadLevels, called after a student is removed so the cards refresh.
function ViewGradeModal({ level, onClose, onChanged }) {
  const [students,  setStudents]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [confirmId, setConfirmId] = useState(null); // student_id awaiting remove confirmation
  const [removingId, setRemovingId] = useState(null); // student_id currently being removed
  const [rowError,  setRowError]  = useState(null); // error from a failed remove

  const supervisorName = level.faculty?.[0]?.name ?? "No supervisor assigned";

  // Remove (unassign) a student from this grade, then update local state + cards.
  const handleRemove = async (student_id) => {
    setRemovingId(student_id);
    setRowError(null);
    try {
      await removeStudentFromLevel(level.id, student_id);
      setStudents((prev) => prev.filter((s) => s.student_id !== student_id));
      setConfirmId(null);
      onChanged?.();
    } catch (err) {
      setRowError(err?.response?.data?.message ?? err?.message ?? "Failed to remove student.");
    } finally {
      setRemovingId(null);
    }
  };

  // load only the students in this grade level
  useEffect(() => {
    fetchAllStudents()
      .then((res) => {
        const all = res.data?.data ?? res.data ?? [];
        setStudents(
          all.filter((s) => String(s.gl_id ?? s.grade_level?.gl_id ?? "") === String(level.id))
        );
      })
      .catch(() => setError("Failed to load students."))
      .finally(() => setLoading(false));
  }, [level]);

  // derive the summary counts from the loaded students
  const total    = students.length;
  const male     = students.filter((s) => (s.gender ?? "").toLowerCase().startsWith("m")).length;
  const female   = students.filter((s) => (s.gender ?? "").toLowerCase().startsWith("f")).length;
  const inactive = students.filter((s) => s.users?.is_active === false).length;
  const dash     = loading ? "…" : 0;

  // Full roster, most recently enrolled first (all students are shown so any
  // one can be removed, not just the most recent).
  const roster = [...students]
    .sort((a, b) => new Date(b.enrollment_date ?? 0) - new Date(a.enrollment_date ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
          <h3 className="font-headline text-xl font-extrabold text-on-surface">{level.name} Details</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-7">
          {error && <p className="text-center text-sm text-error">{error}</p>}

          {/* Top: info + summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            {/* Grade level information */}
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
                Grade Level Information
              </p>
              <div className="divide-y divide-outline-variant/10">
                <InfoRow label="Grade Level">{level.name}</InfoRow>
                <InfoRow label="Total Students">{loading ? "…" : `${total} Student${total === 1 ? "" : "s"}`}</InfoRow>
                <InfoRow label="Assigned Supervisor">{supervisorName}</InfoRow>
                <InfoRow label="Date Created">{formatDate(level.created_at ?? level.date_created)}</InfoRow>
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <span className="text-sm text-on-surface-variant">Status</span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                    Active
                  </span>
                </div>
              </div>
            </div>

            {/* Student summary */}
            <div>
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
                Student Summary
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SummaryStat value={loading ? "…" : total}    label="Total Students"    icon="groups" iconBg="bg-blue-50"     iconColor="text-blue-500" />
                <SummaryStat value={male || dash}             label="Male Students"     icon="man"    iconBg="bg-indigo-50"   iconColor="text-indigo-500" />
                <SummaryStat value={female || dash}           label="Female Students"   icon="woman"  iconBg="bg-rose-50"     iconColor="text-rose-500" />
                <SummaryStat value={inactive || dash}         label="Inactive Students" icon="block"  iconBg="bg-red-50"      iconColor="text-red-500" valueColor={inactive > 0 ? "text-red-500" : "text-on-surface"} />
              </div>
            </div>
          </div>

          {/* Enrolled students — full roster with a per-student Remove action */}
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
              Enrolled Students
            </p>
            {rowError && <p className="text-xs font-medium text-error mb-2">{rowError}</p>}
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span>
              </div>
            ) : roster.length === 0 ? (
              <p className="text-sm text-on-surface-variant px-1 py-3">No students enrolled.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant/15">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant/15">
                      {["Student ID", "Student Name", "Date Assigned", ""].map((h, i) => (
                        <th key={i} className={`text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 whitespace-nowrap ${i === 3 ? "text-right" : "text-left"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {roster.map((s) => (
                      <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-5 py-3 text-sm font-bold text-on-surface whitespace-nowrap">{s.student_id}</td>
                        <td className="px-5 py-3 text-sm font-bold text-on-surface">{s.first_name} {s.last_name}</td>
                        <td className="px-5 py-3 text-sm text-on-surface-variant whitespace-nowrap">{formatDate(s.enrollment_date)}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {confirmId === s.student_id ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs text-on-surface-variant">Remove?</span>
                              <button
                                onClick={() => handleRemove(s.student_id)}
                                disabled={removingId === s.student_id}
                                className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                {removingId === s.student_id && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmId(null)}
                                disabled={removingId === s.student_id}
                                className="text-xs font-bold text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => { setRowError(null); setConfirmId(s.student_id); }}
                              className="text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-1 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-sm">person_remove</span>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-7 py-4 border-t border-outline-variant/20 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SchoolSections() {
  const schoolYearLabel = useSchoolYear();
  const [levels,        setLevels]        = useState([]);   // grade-level cards from the API
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [enrollTarget,  setEnrollTarget]  = useState(null);  // level whose Enroll modal is open
  const [assignTarget,  setAssignTarget]  = useState(null);  // level whose Assign modal is open
  const [viewTarget,    setViewTarget]    = useState(null);  // level whose View modal is open
  const [showAdd,       setShowAdd]       = useState(false);  // Add Grade Level modal open?

  // load all grade levels for the active school year
  const loadLevels = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllSections()
      .then((res) => setLevels(res.data?.data ?? res.data ?? []))
      .catch(() => setError("Failed to load grade levels."))
      .finally(() => setLoading(false));
  }, []);

  // Initial page load intentionally starts the request lifecycle maintained by loadLevels.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLevels(); }, [loadLevels]);

  // enroll students into a level, then close the modal + refresh
  const handleEnroll = async (levelId, studentIds) => {
    await enrollStudentsInLevel(levelId, studentIds);
    setEnrollTarget(null);
    loadLevels();
  };

  // assign a supervisor to a level, then close the modal + refresh
  const handleAssignTeacher = async (levelId, teacherId) => {
    await assignTeacherToSection(levelId, teacherId);
    setAssignTarget(null);
    loadLevels();
  };

  // clear a level's supervisor. The modal stays open (with the current supervisor
  // cleared) so the principal can pick a replacement right away.
  const handleUnassignTeacher = async (levelId, teacherId) => {
    await unassignTeacherFromSection(levelId, teacherId);
    setAssignTarget((prev) => (prev && prev.id === levelId ? { ...prev, faculty: [] } : prev));
    loadLevels();
  };

  // totals shown in the stat cards
  const totalStudents = levels.reduce((a, l) => a + l.students, 0);
  const totalTeachers = levels.reduce((a, l) => a + l.faculty.length, 0);
  // Use the first available order so gaps can be filled without exceeding 12.
  const nextOrder = Array.from({ length: 12 }, (_, index) => index + 1)
    .find((order) => !levels.some((level) => Number(level.level_order) === order)) ?? "";

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full">

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-3xl font-extrabold text-primary">School Grade Levels</h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              Manage grade levels, student assignments, and supervisor assignments for the active school year.
            </p>
          </div>
          {/* Add Grade Level -> setShowAdd(true) opens <AddGradeLevelModal>. A school year
              supports at most 12 grade levels (matches the backend check in
              settings.service.js > addGradeLevel) — disable here instead of letting the
              principal hit a server error. */}
          <button
            onClick={() => setShowAdd(true)}
            disabled={levels.length >= 12}
            title={levels.length >= 12 ? "Maximum of 12 grade levels reached." : undefined}
            className="flex items-center gap-2 shrink-0 px-5 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          >
            <span className="material-symbols-outlined text-lg" style={fillStyle}>add</span>
            Add Grade Level
          </button>
        </div>

        {levels.length >= 12 && (
          <p className="text-xs text-amber-600 font-semibold -mt-4 mb-6">Maximum of 12 grade levels reached.</p>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Grade Levels",        value: levels.length,                  sub: "Active",      subColor: "text-amber-600",         icon: "inventory_2" },
            { label: "Total Students",      value: totalStudents.toLocaleString(), sub: "Students",    subColor: "text-on-surface-variant", icon: "hub"        },
            { label: "Supervisors Assigned",value: totalTeachers,                  sub: "Supervisors", subColor: "text-on-surface-variant", icon: "badge"      },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">{c.label}</p>
                <div className="flex items-end gap-2">
                  <p className="font-headline text-4xl font-extrabold text-on-surface">{c.value}</p>
                  <span className={`text-sm font-bold mb-1 ${c.subColor}`}>{c.sub}</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-on-surface-variant shrink-0">
                <span className="material-symbols-outlined">{c.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Grade Level Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="material-symbols-outlined text-error text-4xl">error</span>
            <p className="text-sm text-on-surface-variant text-center max-w-sm">{error}</p>
            <button onClick={loadLevels} className="text-sm font-bold text-primary hover:underline">Try again</button>
          </div>
        ) : levels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="material-symbols-outlined text-on-surface-variant text-4xl">school</span>
            <p className="text-sm text-on-surface-variant text-center max-w-sm">
              No grade levels found for the active school year. Use{" "}
              <span className="text-primary font-bold">Add Grade Level</span> to create one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* one card per grade level; card actions set enrollTarget / assignTarget / viewTarget -> render the matching modal below */}
            {levels.map((l) => (
              <GradeLevelCard
                key={l.id}
                level={l}
                onManageStudents={(lv) => setEnrollTarget(lv)}
                onAssignSupervisor={(lv) => setAssignTarget(lv)}
                onView={(lv) => setViewTarget(lv)}
              />
            ))}
          </div>
        )}

      </main>

      {enrollTarget && (
        <EnrollStudentsModal
          level={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onConfirm={handleEnroll}
        />
      )}
      {assignTarget && (
        <AssignTeacherModal
          level={assignTarget}
          levels={levels}
          onClose={() => setAssignTarget(null)}
          onConfirm={handleAssignTeacher}
          onUnassign={handleUnassignTeacher}
        />
      )}
      {viewTarget && (
        <ViewGradeModal
          level={viewTarget}
          onClose={() => setViewTarget(null)}
          onChanged={loadLevels}
        />
      )}
      {showAdd && (
        <AddGradeLevelModal
          nextOrder={nextOrder}
          existingGradeLevels={levels}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); loadLevels(); }}
        />
      )}
    </PrincipalLayout>
  );
}

