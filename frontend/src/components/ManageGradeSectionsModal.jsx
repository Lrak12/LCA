import { useEffect, useState } from "react";
import { fetchAllStudents } from "../api/student.js";
import { fetchAllTeachers } from "../api/teacher.js";
import {
  createGradeSection, assignSectionStudents, removeSectionStudent,
  assignSectionSupervisor, unassignSectionSupervisor,
} from "../api/sections.js";

const errorMessage = (error) => error?.response?.data?.message ?? error?.message ?? "Something went wrong.";

export default function ManageGradeSectionsModal({ level, onClose, onChanged }) {
  const [selectedId, setSelectedId] = useState(level.sections?.[0]?.id ?? null);
  const [name, setName] = useState("");
  const [students, setStudents] = useState(() => (level.sections ?? []).flatMap((section) => section.members ?? []));
  const [teachers, setTeachers] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const section = level.sections?.find((item) => item.id === selectedId) ?? null;

  const loadStudents = async () => {
    const res = await fetchAllStudents();
    setStudents(res.data?.data ?? res.data ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllStudents(), fetchAllTeachers()])
      .then(([studentRes, teacherRes]) => {
        if (cancelled) return;
        setStudents(studentRes.data?.data ?? studentRes.data ?? []);
        setTeachers(teacherRes.data?.data ?? teacherRes.data ?? []);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const run = async (action) => {
    setSaving(true);
    setError("");
    try {
      await action();
      await Promise.all([onChanged(), loadStudents()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => run(async () => {
    const res = await createGradeSection(level.id, name.trim());
    setSelectedId(res.data?.data?.section_id ?? res.data?.section_id ?? null);
    setName("");
  });

  const roster = students.filter((student) => Number(student.section_id) === Number(selectedId) && selectedId);
  const eligible = students.filter((student) => {
    if (Number(student.section_id) === Number(selectedId)) return false;
    const assignedThisYear = Number(student.grade_level?.sy_id) === Number(level.sy_id);
    if (assignedThisYear && Number(student.gl_id) !== Number(level.id)) return false;
    const label = `${student.first_name} ${student.last_name} ${student.student_id}`.toLowerCase();
    return label.includes(search.toLowerCase());
  });
  const toggle = (id) => setChosen((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={`Manage ${level.name} sections`} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-6 py-4">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-primary">{level.name} Sections</h2>
            <p className="text-xs text-on-surface-variant">Create sections, assign students, and choose a supervisor for each section.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sections" className="rounded-lg p-2 hover:bg-surface-container-low"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-6">
          {error && <p role="alert" className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</p>}
          <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) addSection(); }} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-48 text-xs font-bold text-on-surface">New section name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Section A" className="mt-1 block w-full rounded-lg border border-outline-variant/40 px-3 py-2 text-sm" />
            </label>
            <button type="submit" disabled={!name.trim() || saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add Section</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {(level.sections ?? []).map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setChosen([]); setTeacherId(""); }} className={`rounded-lg border px-4 py-2 text-sm font-bold ${selectedId === item.id ? "border-primary bg-primary text-white" : "border-outline-variant/30 text-on-surface"}`}>
                {item.name} · {item.students} students
              </button>
            ))}
            {!level.sections?.length && <p className="text-sm text-on-surface-variant">No sections yet. Add the first one above.</p>}
          </div>
          {section && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-xl border border-outline-variant/20 p-4">
                  <h3 className="font-bold text-on-surface">Supervisor for {section.name}</h3>
                  <p className={`mt-1 break-words text-lg font-bold ${section.teacher_name ? "text-on-surface" : "text-on-surface-variant"}`}>{section.teacher_name ?? "No supervisor assigned"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} className="min-w-40 flex-1 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm">
                      <option value="">Choose supervisor</option>
                      {teachers.map((teacher) => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.first_name} {teacher.last_name}</option>)}
                    </select>
                    <button type="button" disabled={!teacherId || saving} onClick={() => run(() => assignSectionSupervisor(level.id, section.id, Number(teacherId)))} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Assign</button>
                    {section.teacher_id && <button type="button" disabled={saving} onClick={() => run(() => unassignSectionSupervisor(level.id, section.id))} className="rounded-lg border border-error/30 px-3 py-2 text-xs font-bold text-error disabled:opacity-50">Remove</button>}
                  </div>
                </div>
                <div className="rounded-xl border border-outline-variant/20 p-4">
                  <h3 className="font-bold text-on-surface">Students in {section.name} ({roster.length})</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">Removing a student also removes their {level.name} enrollment.</p>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {roster.map((student) => <div key={student.student_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-sm">
                      <span>{student.first_name} {student.last_name} · {student.student_id}</span>
                      <button type="button" disabled={saving} onClick={() => run(() => removeSectionStudent(level.id, section.id, student.student_id))} className="text-xs font-bold text-error disabled:opacity-50">Remove</button>
                    </div>)}
                    {!roster.length && <p className="text-sm text-on-surface-variant">{loading ? "Loading students…" : "No students in this section."}</p>}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-outline-variant/20 p-4">
                <h3 className="font-bold text-on-surface">Place students in {section.name}</h3>
                <p className="mt-1 text-xs text-on-surface-variant">Unsectioned students and students in other sections of this grade can be placed here. Existing assignments do not move automatically.</p>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" className="mt-3 w-full rounded-lg border border-outline-variant/40 px-3 py-2 text-sm" />
                <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                  {loading ? <p className="text-sm text-on-surface-variant">Loading students…</p> : eligible.map((student) => {
                    const currentSection = level.sections?.find((item) => Number(item.id) === Number(student.section_id));
                    return <label key={student.student_id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-container-low cursor-pointer">
                      <input type="checkbox" checked={chosen.includes(student.student_id)} onChange={() => toggle(student.student_id)} />
                      <span>{student.first_name} {student.last_name} · {student.student_id}<span className="block text-xs text-on-surface-variant">{currentSection ? `Currently ${currentSection.name}` : Number(student.gl_id) === Number(level.id) ? "Unsectioned" : "Not enrolled this year"}</span></span>
                    </label>;
                  })}
                  {!loading && !eligible.length && <p className="text-sm text-on-surface-variant">No eligible students found.</p>}
                </div>
                <button type="button" disabled={!chosen.length || saving} onClick={() => run(async () => { await assignSectionStudents(level.id, section.id, chosen); setChosen([]); })} className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Place {chosen.length || ""} Student{chosen.length === 1 ? "" : "s"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
