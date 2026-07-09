import { useState, useEffect, useCallback } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchAllSections, enrollStudentsInLevel, assignTeacherToSection } from "../../api/sections.js";
import { fetchAllStudents } from "../../api/student.js";
import { fetchAllTeachers } from "../../api/teacher.js";

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
const avatarBg = (str = "") => {
  const code = [...str].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
};
const initials = (name = "") =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

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
          ? "bg-primary text-white hover:bg-primary/90"
          : "text-on-surface-variant hover:bg-surface-container-lowest"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}

function GradeLevelCard({ level, onManageStudents, onAssignSupervisor, onView }) {
  const supervisors = level.faculty ?? [];
  const headline    = supervisors[0]?.name ?? null;
  const extra       = supervisors.length - 1;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 flex flex-col overflow-hidden">
      <div className="p-5 flex-1">
        {/* Grade label + student count */}
        <div className="flex items-start justify-between mb-5">
          <span className="text-[10px] font-extrabold tracking-widest uppercase bg-surface-container-high text-on-surface-variant px-2.5 py-1 rounded-full">
            {level.grade}
          </span>
          <div className="text-right leading-none">
            <p className="font-headline text-2xl font-extrabold text-on-surface">{level.students}</p>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mt-1">Students</p>
          </div>
        </div>

        {/* Assigned supervisor */}
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">
          Assigned Supervisor
        </p>
        <div className="flex items-center justify-between gap-2">
          {headline ? (
            <span className="text-sm font-bold text-on-surface truncate">
              {headline}
              {extra > 0 && <span className="text-on-surface-variant font-medium"> +{extra} more</span>}
            </span>
          ) : (
            <span className="text-sm text-on-surface-variant">No supervisor assigned</span>
          )}
          {headline && (
            <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
              Assigned
            </span>
          )}
        </div>
      </div>

      {/* Action footer */}
      <div className="grid grid-cols-3 border-t border-outline-variant/15 divide-x divide-outline-variant/15">
        <CardAction icon="group"      label="Manage" onClick={() => onManageStudents(level)} />
        <CardAction icon="group_add"  label="Assign" primary onClick={() => onAssignSupervisor(level)} />
        <CardAction icon="visibility" label="View"   onClick={() => onView(level)} />
      </div>
    </div>
  );
}

// ─── Enroll Students Modal ────────────────────────────────────────────────────
function EnrollStudentsModal({ level, onClose, onConfirm }) {
  const [search,      setSearch]      = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [students,    setStudents]    = useState([]);
  const [selected,    setSelected]    = useState(new Set());
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    fetchAllStudents()
      .then((res) => setStudents(res.data?.data ?? res.data ?? []))
      .catch(() => setError("Failed to load students."))
      .finally(() => setLoading(false));
  }, []);

  // Build sorted unique grade level options from loaded students
  const gradeOptions = [
    { value: "all",        label: "All" },
    { value: "unassigned", label: "Unassigned" },
    ...Array.from(
      new Map(
        students
          .filter((s) => s.grade_level)
          .map((s) => [s.grade_level.gl_id, s.grade_level.level_name])
      ).entries()
    )
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
      .map(([gl_id, level_name]) => ({ value: String(gl_id), label: level_name })),
  ];

  const filtered = students.filter((s) => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || String(s.student_id).includes(search);
    const matchesGrade =
      gradeFilter === "all"
        ? true
        : gradeFilter === "unassigned"
        ? !s.gl_id
        : String(s.gl_id) === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      filtered.every((s) => selected.has(s.student_id))
        ? new Set()
        : new Set(filtered.map((s) => s.student_id))
    );

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(level.id, [...selected]); }
    finally { setSaving(false); }
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
              className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Grade level filter pills */}
        {!loading && !error && (
          <div className="px-6 pb-2 shrink-0 flex gap-1.5 flex-wrap">
            {gradeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGradeFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-[11px] font-extrabold transition-colors border ${
                  gradeFilter === opt.value
                    ? "bg-primary text-white border-primary"
                    : "bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:border-primary/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            <span className="text-xs text-on-surface-variant">{students.length} total students</span>
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
                const glLabel  = s.grade_level?.level_name ?? null;
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
                        {glLabel && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-surface-container-high text-[10px] font-extrabold">
                            {glLabel}
                          </span>
                        )}
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

        <div className="px-6 py-4 border-t border-outline-variant/20 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
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
function AssignTeacherModal({ level, onClose, onConfirm }) {
  const [search,   setSearch]   = useState("");
  const [teachers, setTeachers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

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

  const filtered = teachers.filter((t) =>
    `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try { await onConfirm(level.id, selected); }
    finally { setSaving(false); }
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
            Each grade level can have one primary supervisor.
          </div>
        </div>

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
                return (
                  <button
                    key={t.teacher_id}
                    onClick={() => setSelected(t.teacher_id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors border text-left ${
                      isSelected ? "bg-primary/5 border-primary/30" : "hover:bg-surface-container-lowest border-outline-variant/20"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-xl shrink-0 ${isSelected ? "text-primary" : "text-on-surface-variant"}`}
                      style={isSelected ? fillStyle : undefined}
                    >
                      {isSelected ? "radio_button_checked" : "radio_button_unchecked"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{name}</p>
                      {subtitle && <p className="text-[11px] text-on-surface-variant truncate">{subtitle}</p>}
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
                      Available
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/20 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-xl hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
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

function ViewGradeModal({ level, onClose }) {
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const supervisorName = level.faculty?.[0]?.name ?? "No supervisor assigned";

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

  const total    = students.length;
  const male     = students.filter((s) => (s.gender ?? "").toLowerCase().startsWith("m")).length;
  const female   = students.filter((s) => (s.gender ?? "").toLowerCase().startsWith("f")).length;
  const inactive = students.filter((s) => s.users?.is_active === false).length;
  const dash     = loading ? "…" : 0;

  const recent = [...students]
    .sort((a, b) => new Date(b.enrollment_date ?? 0) - new Date(a.enrollment_date ?? 0))
    .slice(0, 5);

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
              <div className="grid grid-cols-2 gap-3">
                <SummaryStat value={loading ? "…" : total}    label="Total Students"    icon="groups" iconBg="bg-blue-50"     iconColor="text-blue-500" />
                <SummaryStat value={male || dash}             label="Male Students"     icon="man"    iconBg="bg-indigo-50"   iconColor="text-indigo-500" />
                <SummaryStat value={female || dash}           label="Female Students"   icon="woman"  iconBg="bg-rose-50"     iconColor="text-rose-500" />
                <SummaryStat value={inactive || dash}         label="Inactive Students" icon="block"  iconBg="bg-red-50"      iconColor="text-red-500" valueColor={inactive > 0 ? "text-red-500" : "text-on-surface"} />
              </div>
            </div>
          </div>

          {/* Recently added students */}
          <div>
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">
              Recently Added Students
            </p>
            {loading ? (
              <div className="py-8 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span>
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-on-surface-variant px-1 py-3">No students enrolled.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant/15">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant/15">
                      {["Student ID", "Student Name", "Date Assigned"].map((h) => (
                        <th key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant text-left px-5 py-3 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {recent.map((s) => (
                      <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-5 py-3 text-sm font-bold text-on-surface whitespace-nowrap">{s.student_id}</td>
                        <td className="px-5 py-3 text-sm font-bold text-on-surface">{s.first_name} {s.last_name}</td>
                        <td className="px-5 py-3 text-sm text-on-surface-variant whitespace-nowrap">{formatDate(s.enrollment_date)}</td>
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
  const [levels,        setLevels]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [enrollTarget,  setEnrollTarget]  = useState(null);
  const [assignTarget,  setAssignTarget]  = useState(null);
  const [viewTarget,    setViewTarget]    = useState(null);

  const loadLevels = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllSections()
      .then((res) => setLevels(res.data?.data ?? res.data ?? []))
      .catch(() => setError("Failed to load grade levels."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLevels(); }, [loadLevels]);

  const handleEnroll = async (levelId, studentIds) => {
    await enrollStudentsInLevel(levelId, studentIds);
    setEnrollTarget(null);
    loadLevels();
  };

  const handleAssignTeacher = async (levelId, teacherId) => {
    await assignTeacherToSection(levelId, teacherId);
    setAssignTarget(null);
    loadLevels();
  };

  const totalStudents = levels.reduce((a, l) => a + l.students, 0);
  const totalTeachers = levels.reduce((a, l) => a + l.faculty.length, 0);

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full">

        {/* Header */}
        <div className="mb-8">
          <h2 className="font-headline text-3xl font-extrabold text-primary">School Grade Levels</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            Manage grade levels, student assignments, and supervisor assignments for the active school year.
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
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
              No grade levels found for the active school year. Add them in{" "}
              <span className="text-primary font-bold">Settings → Academic Config</span>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
          onClose={() => setAssignTarget(null)}
          onConfirm={handleAssignTeacher}
        />
      )}
      {viewTarget && (
        <ViewGradeModal
          level={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      )}
    </PrincipalLayout>
  );
}

