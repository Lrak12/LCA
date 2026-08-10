import { useState, useEffect, useCallback } from "react";
import {fetchStudentAcademicRecord,saveSupervisorNote,saveAcademicRemarks,markReadyForNext,updateStudentProfile,setPaceScore,} from "../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const QLABEL = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

// "View Student" academic record modal (opened from the supervisor Student
// Monitoring page). Loads everything from GET /teacher/student-record
// (teacher.service.getStudentAcademicRecord); the Save-note and Ready-for-next
// buttons hit saveSupervisorNote / markReadyForNext. Edit Student Info is a stub.
export default function StudentAcademicRecordModal({ studentId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [subject, setSubject] = useState(null);
  const [quarter, setQuarter] = useState("all");
  const [note,    setNote]    = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMsg, setNoteMsg] = useState(null); // { ok, text } feedback after Save Note
  const [readying, setReadying] = useState(false);

  // ── Bible Memory / Reading WPM (supervisor-recorded, current quarter) ─────────
  const [bibleMemory, setBibleMemory] = useState("");
  const [readingWpm,  setReadingWpm]  = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarksMsg, setRemarksMsg] = useState(null); // { ok, text } feedback after Save

  // ── Edit mode (supervisor edits profile fields + grades) ──────────────────────
  const [editMode, setEditMode]       = useState(false);
  const [profileForm, setProfileForm] = useState(null); // { first_name, last_name, dateOfBirth, gender, address, contact }
  const [savingProfile, setSavingProfile] = useState(false);
  const [editMsg, setEditMsg]         = useState(null); // { ok, text }
  const [editingCell, setEditingCell] = useState(null); // "subject|pace" of the grade cell being edited
  const [cellScore, setCellScore]     = useState("");
  const [savingCell, setSavingCell]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchStudentAcademicRecord(studentId)
      .then((res) => {
        const d = res.data ?? null;
        setData(d);
        setNote(d?.note ?? "");
        setBibleMemory(d?.remarks?.bibleMemory ?? "");
        setReadingWpm(d?.remarks?.readingWpm != null ? String(d.remarks.readingWpm) : "");
        if (d?.subjects?.length) setSubject((s) => s ?? d.subjects[0]);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNote = async () => {
    setSavingNote(true);
    setNoteMsg(null);
    try {
      await saveSupervisorNote(studentId, note);
      setNoteMsg({ ok: true, text: "Note saved." });
    } catch (err) {
      setNoteMsg({ ok: false, text: err.response?.data?.message ?? err.message ?? "Failed to save note." });
    } finally {
      setSavingNote(false);
    }
  };
  const handleSaveRemarks = async () => {
    setSavingRemarks(true);
    setRemarksMsg(null);
    try {
      await saveAcademicRemarks(studentId, { bible_memory_rating: bibleMemory === "" ? null : Number(bibleMemory), reading_wpm: readingWpm === "" ? null : Number(readingWpm) });
      setRemarksMsg({ ok: true, text: "Saved." });
      load();
    } catch (err) {
      setRemarksMsg({ ok: false, text: err.response?.data?.message ?? err.message ?? "Failed to save." });
    } finally {
      setSavingRemarks(false);
    }
  };
  const handleReady = async () => {
    setReadying(true);
    try { await markReadyForNext(studentId); load(); } catch { /* ignore */ } finally { setReadying(false); }
  };

  // Enter edit mode: seed the profile form from the loaded profile.
  const startEdit = () => {
    const pr = data?.profile;
    setProfileForm({
      first_name: pr?.first_name ?? "",
      last_name:  pr?.last_name ?? "",
      date_of_birth: pr?.dateOfBirth ? String(pr.dateOfBirth).slice(0, 10) : "",
      gender:     pr?.gender && pr.gender !== "—" ? pr.gender : "",
      address:    pr?.address && pr.address !== "—" ? pr.address : "",
      contact_number: pr?.contact && pr.contact !== "—" ? pr.contact : "",
    });
    setEditMsg(null);
    setEditingCell(null);
    setEditMode(true);
  };
  const cancelEdit = () => { setEditMode(false); setEditingCell(null); setEditMsg(null); };

  const saveProfile = async () => {
    setSavingProfile(true);
    setEditMsg(null);
    try {
      await updateStudentProfile(studentId, profileForm);
      setEditMsg({ ok: true, text: "Student information saved." });
      load();
    } catch (err) {
      setEditMsg({ ok: false, text: err.response?.data?.message ?? err.message ?? "Failed to save." });
    } finally {
      setSavingProfile(false);
    }
  };

  // Inline grade edit: save one PACE cell's score, then reload the record.
  const saveCell = async (subj, cell) => {
    if (!cell?.pace) { setEditingCell(null); return; }
    setSavingCell(true);
    try {
      await setPaceScore({ student_id: studentId, subject: subj, pace_number: cell.pace, score: cellScore });
      setEditingCell(null);
      load();
    } catch (err) {
      setEditMsg({ ok: false, text: err.response?.data?.message ?? err.message ?? "Failed to update grade." });
      setEditingCell(null);
    } finally {
      setSavingCell(false);
    }
  };

  const setPF = (k, v) => setProfileForm((f) => ({ ...f, [k]: v }));

  const p   = data?.profile;
  const tc  = data?.topCards ?? {};
  const cs  = data?.completionSummary ?? {};
  const as  = data?.attendanceSummary ?? {};
  const subjects = data?.subjects ?? [];
  const g   = subject ? data?.grades?.[subject] : null;
  const quartersShown = (g?.quarters ?? []).filter((q) => quarter === "all" || String(q.quarter) === String(quarter));
  const headerPaces = (g?.quarters?.[0]?.cells ?? []).map((c) => c.pace);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6">
      <div className="bg-white rounded-2xl shadow-xl border border-outline-variant/20 w-full max-w-6xl mx-4">

        {/* Header */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-outline-variant/10">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary" style={fillStyle}>contact_page</span>
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-on-surface">Student Profile and Academic Recording</h2>
              <p className="text-xs text-on-surface-variant">Official student academic records and grading information</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container-low text-red-500">
            <span className="material-symbols-outlined text-xl">cancel</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-on-surface-variant">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="m-7 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>
        ) : (
          <div className="p-7 space-y-6">

            {/* Profile + top cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Profile — read-only, or editable inputs in edit mode */}
              <div>
                {editMode && profileForm ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <EditField label="First Name"><input value={profileForm.first_name} onChange={(e) => setPF("first_name", e.target.value)} className={editInput} /></EditField>
                      <EditField label="Last Name"><input value={profileForm.last_name} onChange={(e) => setPF("last_name", e.target.value)} className={editInput} /></EditField>
                    </div>
                    <span className="inline-block bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded">Student ID: {p?.student_id}</span>
                    <EditField label="Date of Birth"><input type="date" value={profileForm.date_of_birth} onChange={(e) => setPF("date_of_birth", e.target.value)} className={editInput} /></EditField>
                    <EditField label="Gender">
                      <select value={profileForm.gender} onChange={(e) => setPF("gender", e.target.value)} className={editInput}>
                        <option value="">—</option><option>Male</option><option>Female</option>
                      </select>
                    </EditField>
                    <EditField label="Address"><input value={profileForm.address} onChange={(e) => setPF("address", e.target.value)} className={editInput} /></EditField>
                    <EditField label="Contact"><input value={profileForm.contact_number} onChange={(e) => setPF("contact_number", e.target.value)} className={editInput} /></EditField>
                    <p className="text-[11px] text-on-surface-variant">Grade Level: <strong>{p?.gradeLevel}</strong> · SY: <strong>{p?.schoolYear}</strong></p>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={saveProfile} disabled={savingProfile} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50">
                        {savingProfile ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-sm" style={fillStyle}>save</span>}
                        {savingProfile ? "Saving…" : "Save Info"}
                      </button>
                      <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50">Cancel</button>
                    </div>
                    {editMsg && <p className={`text-[11px] font-semibold flex items-center gap-1 ${editMsg.ok ? "text-green-600" : "text-red-600"}`}><span className="material-symbols-outlined text-xs">{editMsg.ok ? "check_circle" : "error"}</span>{editMsg.text}</p>}
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-extrabold text-on-surface">{p?.name}</h3>
                    <span className="inline-block bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded mt-1">Student ID: {p?.student_id}</span>
                    <div className="mt-3 space-y-1.5 text-sm text-on-surface-variant">
                      <p>🎂 Date of Birth: {fmtDate(p?.dateOfBirth)}</p>
                      <p>⚧ Gender: {p?.gender}</p>
                      <p>🎓 Grade Level: {p?.gradeLevel}</p>
                      <p>📅 School Year: {p?.schoolYear}</p>
                      <p>📍 Address: {p?.address}</p>
                      <p>📞 Contact: {p?.contact}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Top cards */}
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MiniCard label="Average Score" sub="Across all subjects" value={tc.averageScore != null ? `${tc.averageScore}%` : "—"} valueColor="text-on-surface" icon="bar_chart" iconColor="text-blue-500" />
                <MiniCard label="Performance Points" sub="Total Points Earned" value={`${tc.performancePoints ?? 0} pts`} valueColor="text-on-surface" icon="bolt" iconColor="text-purple-500" />
                <MiniCard label="Current Rank" sub="Top in Grade" value={tc.rank ? `#${tc.rank}` : "—"} valueColor="text-on-surface" icon="trophy" iconColor="text-amber-500" />

                {/* Completion summary */}
                <div className="sm:col-span-2 border border-outline-variant/20 rounded-xl p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">PACE Completion Summary</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-center">
                    <SumCell n={cs.onTime} label="Completed On Time" color="text-green-600" />
                    <SumCell n={cs.late} label="Completed Late" color="text-orange-500" />
                    <SumCell n={cs.extended} label="Completed with Extension" color="text-blue-500" />
                    <SumCell n={cs.notPassed} label="PACE Tests Not Passed" color="text-red-500" />
                  </div>
                </div>
                {/* Attendance summary */}
                <div className="border border-outline-variant/20 rounded-xl p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">Attendance Summary</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-center">
                    <AttCell n={as.present} pct={as.presentPct} label="Present" bg="bg-green-50" color="text-green-600" />
                    <AttCell n={as.absent} pct={as.absentPct} label="Absent" bg="bg-red-50" color="text-red-500" />
                    <AttCell n={as.tardy} pct={as.tardyPct} label="Tardy / Late" bg="bg-amber-50" color="text-amber-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Subject tabs + grade table */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {subjects.map((s) => (
                    <button key={s} onClick={() => setSubject(s)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${subject === s ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"}`}>
                      {s}
                    </button>
                  ))}
                  {subjects.length === 0 && <span className="text-sm text-on-surface-variant">No subjects with PACE data.</span>}
                </div>

                {g && (
                  <div className="border border-outline-variant/15 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h4 className="text-sm font-extrabold text-on-surface uppercase">{subject}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface-variant">Quarter:</span>
                        <select value={quarter} onChange={(e) => setQuarter(e.target.value)}
                          className="border border-gray-200 rounded-lg pl-2 pr-8 py-1 text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer bg-white">
                          <option value="all">All Quarters</option>
                          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{QLABEL[q - 1]}</option>)}
                        </select>
                      </div>
                    </div>
                    {quarter !== "all" ? (
                      /* Per-quarter detailed view (one row per PACE) */
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/15">
                              <th className="px-3 py-2 text-left">PACE No.</th>
                              <th className="px-3 py-2 text-left">Date Assigned</th>
                              <th className="px-3 py-2 text-left">Date Completed</th>
                              <th className="px-3 py-2 text-center">Score</th>
                              <th className="px-3 py-2 text-center">Status</th>
                              <th className="px-3 py-2 text-left">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(quartersShown[0]?.cells ?? []).filter((c) => c.pace != null).map((c, i) => (
                              <tr key={i} className="border-b border-outline-variant/10">
                                <td className="px-3 py-3 text-sm font-bold text-on-surface">{c.pace}</td>
                                <td className="px-3 py-3 text-sm text-on-surface-variant">{fmtDate(c.assignedDate)}</td>
                                <td className="px-3 py-3 text-sm text-on-surface-variant">{fmtDate(c.completedDate)}</td>
                                <td className="px-3 py-3 text-center">
                                  {c.score != null
                                    ? <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${c.score >= 90 ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface"}`}>{c.score}</span>
                                    : <span className="text-on-surface-variant/50">—</span>}
                                </td>
                                <td className="px-3 py-3 text-center"><StatusPill status={c.status} /></td>
                                <td className="px-3 py-3 text-sm text-on-surface-variant">{c.remarks || "—"}</td>
                              </tr>
                            ))}
                            {(quartersShown[0]?.cells ?? []).filter((c) => c.pace != null).length === 0 && (
                              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-on-surface-variant">No PACEs for this quarter.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/15">
                            <th className="px-3 py-2 text-left"></th>
                            {[0, 1, 2].map((i) => <th key={i} className="px-3 py-2 text-center">PACE {headerPaces[i] ?? i + 1}</th>)}
                            <th className="px-3 py-2 text-center">Total Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quartersShown.map((q) => (
                            <tr key={q.quarter} className="border-b border-outline-variant/10">
                              <td className="px-3 py-3 text-xs font-bold text-on-surface-variant">{QLABEL[q.quarter - 1]}</td>
                              {q.cells.map((c, i) => {
                                const cellKey = `${subject}|${c.pace}`;
                                const isEditing = editMode && editingCell === cellKey && c.pace != null;
                                return (
                                  <td key={i} className="px-3 py-3 text-center">
                                    {isEditing ? (
                                      <input type="number" min="0" max="100" autoFocus value={cellScore} disabled={savingCell}
                                        title="Press Enter to save, Esc to cancel (blank clears the grade)"
                                        onChange={(e) => setCellScore(e.target.value)}
                                        onBlur={() => setEditingCell(null)}
                                        onKeyDown={(e) => { if (e.key === "Enter") saveCell(subject, c); if (e.key === "Escape") setEditingCell(null); }}
                                        className="w-16 border border-primary/50 rounded-lg px-1.5 py-1 text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                    ) : editMode && c.pace != null ? (
                                      <button type="button" title="Click to edit grade"
                                        onClick={() => { setEditingCell(cellKey); setCellScore(c.score ?? ""); }}
                                        className="min-w-[3rem] rounded-lg px-1.5 py-1 hover:bg-primary/5 border border-dashed border-primary/30 cursor-pointer">
                                        <Cell cell={c} />
                                      </button>
                                    ) : (
                                      <Cell cell={c} />
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-3 text-center font-extrabold text-primary">{q.total != null ? q.total : "-"}</td>
                            </tr>
                          ))}
                          <tr className="bg-surface-container-lowest">
                            <td className="px-3 py-3 text-xs font-extrabold text-on-surface">Average</td>
                            <td colSpan={3} />
                            <td className="px-3 py-3 text-center font-extrabold text-primary">{g.average != null ? g.average : "-"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    )}
                    <div className="flex items-end gap-4 mt-3 text-sm flex-wrap">
                      <label className="flex items-center gap-2">
                        <span className="text-on-surface-variant">Bible Memory:</span>
                        <input type="number" min="0" max="100" value={bibleMemory} onChange={(e) => setBibleMemory(e.target.value)}
                          className="w-20 text-sm font-bold text-on-surface border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-on-surface-variant">Reading WPM:</span>
                        <input type="number" min="0" value={readingWpm} onChange={(e) => setReadingWpm(e.target.value)}
                          className="w-20 text-sm font-bold text-on-surface border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      </label>
                      <button onClick={handleSaveRemarks} disabled={savingRemarks}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50">
                        {savingRemarks ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-sm" style={fillStyle}>save</span>}
                        {savingRemarks ? "Saving…" : "Save"}
                      </button>
                      {remarksMsg && (
                        <span className={`text-[11px] font-semibold flex items-center gap-1 ${remarksMsg.ok ? "text-green-600" : "text-red-600"}`}>
                          <span className="material-symbols-outlined text-xs">{remarksMsg.ok ? "check_circle" : "error"}</span>{remarksMsg.text}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Legend + actions */}
              <div>
                <div className="border border-outline-variant/15 rounded-xl p-4 mb-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">PACE Status Legend</p>
                  <LegendItem color="bg-green-500" title="Completed" desc="PACE has been finished and scored" />
                  <LegendItem color="bg-orange-500" title="Ongoing" desc="PACE is currently in progress" />
                  <LegendItem color="bg-slate-300" title="Not Yet Started" desc="PACE has not been started" />
                </div>
                <button onClick={editMode ? cancelEdit : startEdit}
                  className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                  <span className="material-symbols-outlined text-base">{editMode ? "close" : "edit"}</span>
                  {editMode ? "Done Editing" : "Edit Student Information"}
                </button>
                {editMode && (
                  <p className="text-[11px] text-on-surface-variant mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">info</span>Click a grade in the table to edit it.
                  </p>
                )}
              </div>
            </div>

            {/* Bottom: brought home / 100s / notes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ListCard icon="home" iconColor="text-green-500" title="Paces Brought Home" count={data?.broughtHome?.count ?? 0} countLabel="Brought Home"
                rows={data?.broughtHome?.list ?? []} dateLabel="Date Brought Home" />
              <ListCard icon="counter_5" iconColor="text-blue-500" title="100s Achieved" count={data?.hundreds?.count ?? 0} countLabel="Total Number of 100s"
                rows={data?.hundreds?.list ?? []} dateLabel="Date Achieved 100" />
              <div className="border border-outline-variant/15 rounded-xl p-4 flex flex-col">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">Supervisor Notes</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5}
                  placeholder="Add notes about the student's progress, behavior, strengths, areas for improvement, or any other observations…"
                  className="flex-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                <button onClick={handleSaveNote} disabled={savingNote}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-[#0d1b2e] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {savingNote ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
                  {savingNote ? "Saving…" : "Save Note"}
                </button>
                {noteMsg && (
                  <p className={`mt-2 text-xs font-semibold flex items-center gap-1.5 ${noteMsg.ok ? "text-green-600" : "text-red-600"}`}>
                    <span className="material-symbols-outlined text-sm">{noteMsg.ok ? "check_circle" : "error"}</span>{noteMsg.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const editInput = "w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";
const EditField = ({ label, children }) => (
  <label className="block">
    <span className="block text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-0.5">{label}</span>
    {children}
  </label>
);
const MiniCard = ({ label, sub, value, valueColor, icon, iconColor }) => (
  <div className="border border-outline-variant/20 rounded-xl p-4">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant">{label}</p>
        <p className="text-[9px] text-on-surface-variant/70">{sub}</p>
      </div>
      <span className={`material-symbols-outlined text-lg ${iconColor}`} style={fillStyle}>{icon}</span>
    </div>
    <p className={`text-2xl font-extrabold mt-2 ${valueColor}`}>{value}</p>
  </div>
);
const SumCell = ({ n, label, color }) => (
  <div>
    <p className={`text-2xl font-extrabold ${color}`}>{n ?? 0}</p>
    <p className="text-[9px] text-on-surface-variant leading-tight mt-1">{label}</p>
  </div>
);
const AttCell = ({ n, pct, label, bg, color }) => (
  <div className={`rounded-lg py-2 ${bg}`}>
    <p className={`text-xl font-extrabold ${color}`}>{n ?? 0}</p>
    <p className="text-[9px] text-on-surface-variant">{label}</p>
    <p className="text-[9px] font-bold text-on-surface-variant">{(pct ?? 0).toFixed(2)}%</p>
  </div>
);
const Cell = ({ cell }) => {
  if (cell.score != null) return <span className={`font-bold ${cell.score >= 90 ? "text-green-600" : "text-on-surface"}`}>{cell.score}</span>;
  if (cell.status === "Completed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Completed</span>;
  if (cell.status === "Ongoing") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">Ongoing</span>;
  return <span className="text-[11px] text-on-surface-variant/50">Not Started</span>;
};
// Status pill for the per-quarter detailed table (Completed / Ongoing / Not Started).
const StatusPill = ({ status }) => {
  if (status === "Completed") return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">Completed</span>;
  if (status === "Ongoing")   return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Ongoing</span>;
  if (status === "Failed")    return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">Failed</span>;
  return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Not Started</span>;
};
const LegendItem = ({ color, title, desc }) => (
  <div className="flex items-start gap-2 mb-2.5">
    <span className={`w-2.5 h-2.5 rounded-full mt-1 ${color}`} />
    <div>
      <p className="text-xs font-bold text-on-surface">{title}</p>
      <p className="text-[10px] text-on-surface-variant leading-tight">{desc}</p>
    </div>
  </div>
);
const ListCard = ({ icon, iconColor, title, count, countLabel, rows, dateLabel }) => (
  <div className="border border-outline-variant/15 rounded-xl p-4">
    <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">{title}</p>
    <div className="flex items-center gap-2 mb-3">
      <span className={`material-symbols-outlined ${iconColor}`} style={fillStyle}>{icon}</span>
      <div>
        <p className="text-[9px] text-on-surface-variant">{countLabel}</p>
        <p className="text-2xl font-extrabold text-on-surface leading-none">{count}</p>
      </div>
    </div>
    <table className="w-full text-xs">
      <thead><tr className="text-[9px] font-extrabold uppercase tracking-widest text-on-surface-variant"><th className="text-left py-1">PACE</th><th className="text-right py-1">{dateLabel}</th></tr></thead>
      <tbody>
        {rows.slice(0, 5).map((r, i) => (
          <tr key={i} className="border-t border-outline-variant/10">
            <td className="py-1.5 text-on-surface">{r.pace}</td>
            <td className="py-1.5 text-right text-on-surface-variant">{r.date ? fmtDate(r.date) : "—"}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={2} className="py-3 text-center text-on-surface-variant">None yet.</td></tr>}
      </tbody>
    </table>
    {rows.length > 5 && <p className="text-[11px] font-bold text-primary mt-2">See all ›</p>}
  </div>
);
