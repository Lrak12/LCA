import { useState, useEffect, useCallback } from "react";
import {
  fetchStudentAcademicRecord,
  saveSupervisorNote,
  markReadyForNext,
} from "../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const QLABEL = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

export default function StudentAcademicRecordModal({ studentId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [subject, setSubject] = useState(null);
  const [quarter, setQuarter] = useState("all");
  const [note,    setNote]    = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [readying, setReadying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchStudentAcademicRecord(studentId)
      .then((res) => {
        const d = res.data ?? null;
        setData(d);
        setNote(d?.note ?? "");
        if (d?.subjects?.length) setSubject((s) => s ?? d.subjects[0]);
      })
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNote = async () => {
    setSavingNote(true);
    try { await saveSupervisorNote(studentId, note); } catch { /* ignore */ } finally { setSavingNote(false); }
  };
  const handleReady = async () => {
    setReadying(true);
    try { await markReadyForNext(studentId); load(); } catch { /* ignore */ } finally { setReadying(false); }
  };

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
              {/* Profile */}
              <div>
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
              </div>

              {/* Top cards */}
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MiniCard label="Average Score" sub="Across all subjects" value={tc.averageScore != null ? `${tc.averageScore}%` : "—"} valueColor="text-on-surface" icon="bar_chart" iconColor="text-blue-500" />
                <MiniCard label="Performance Points" sub="Total Points Earned" value={`${tc.performancePoints ?? 0} pts`} valueColor="text-on-surface" icon="bolt" iconColor="text-purple-500" />
                <MiniCard label="Current Rank" sub="Top in Grade" value={tc.rank ? `#${tc.rank}` : "—"} valueColor="text-on-surface" icon="trophy" iconColor="text-amber-500" />

                {/* Completion summary */}
                <div className="sm:col-span-2 border border-outline-variant/20 rounded-xl p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">PACE Completion Summary</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <SumCell n={cs.onTime} label="Completed On Time" color="text-green-600" />
                    <SumCell n={cs.late} label="Completed Late" color="text-orange-500" />
                    <SumCell n={cs.extended} label="Completed with Extension" color="text-blue-500" />
                    <SumCell n={cs.notPassed} label="PACE Tests Not Passed" color="text-red-500" />
                  </div>
                </div>
                {/* Attendance summary */}
                <div className="border border-outline-variant/20 rounded-xl p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">Attendance Summary</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
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
                          className="text-sm font-bold border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20">
                          <option value="all">All Quarters</option>
                          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{QLABEL[q - 1]}</option>)}
                        </select>
                      </div>
                    </div>
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
                              {q.cells.map((c, i) => <td key={i} className="px-3 py-3 text-center"><Cell cell={c} /></td>)}
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
                    <div className="flex items-center gap-6 mt-3 text-sm">
                      <span className="text-on-surface-variant">Bible Memory: <strong className="text-on-surface">{data?.remarks?.bibleMemory ?? "—"}</strong></span>
                      <span className="text-on-surface-variant">Reading WPM: <strong className="text-on-surface">{data?.remarks?.readingWpm ?? "—"}</strong></span>
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
                <button className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
                  title="Editing student info is coming soon">
                  <span className="material-symbols-outlined text-base">edit</span> Edit Student Information
                </button>
                <button onClick={handleReady} disabled={readying || data?.readyForNext}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
                  <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>
                  {data?.readyForNext ? "Marked Ready" : readying ? "Saving…" : "Ready for Next PACE"}
                </button>
              </div>
            </div>

            {/* Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RecCard accent="border-blue-200 bg-blue-50/40" icon="psychology" iconColor="text-blue-500" title="Diagnostic Recommendation">
                {data?.diagnostic ? (<>
                  <p className="text-xl font-extrabold text-blue-600">{data.diagnostic.level}</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mt-3">Placement Basis</p>
                  <p className="text-xs font-bold text-on-surface">{data.diagnostic.basis}</p>
                </>) : <p className="text-sm text-on-surface-variant">No diagnostic on record.</p>}
              </RecCard>
              <RecCard accent="border-purple-200 bg-purple-50/40" icon="auto_awesome" iconColor="text-purple-500" title="Projected PACE (System Suggestion)">
                {data?.projected?.pace ? (<>
                  <p className="text-xl font-extrabold text-purple-600">{data.projected.pace}{data.projected.title ? ` – ${data.projected.title}` : ""}</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mt-3">Placement Basis</p>
                  <p className="text-xs font-bold text-on-surface">{data.projected.basis}</p>
                  <p className="text-xs text-on-surface-variant mt-2">Suggested Start Date: {fmtDate(data.projected.suggestedStart)}</p>
                </>) : <p className="text-sm text-on-surface-variant">Not enough completion history yet.</p>}
              </RecCard>
              <RecCard accent="border-amber-200 bg-amber-50/40" icon="warning" iconColor="text-amber-500" title="Academic Monitoring Recommendation">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">System Recommendation</p>
                <p className="text-xs text-on-surface mb-2">
                  {data?.monitoring?.needsAttention
                    ? `Student has ${data.monitoring.overdue} ongoing PACE(s) beyond the expected completion period and ${data.monitoring.notPassed} PACE test(s) not passed.`
                    : "Student is on track. No monitoring flags."}
                </p>
                {data?.monitoring?.needsAttention && (
                  <ul className="text-xs text-on-surface-variant list-disc pl-4 space-y-0.5">
                    <li>Provide closer monitoring for ongoing PACEs.</li>
                    <li>Schedule a progress review this week.</li>
                    <li>Encourage timely completion before assigning new PACEs.</li>
                  </ul>
                )}
                <p className="text-[10px] text-on-surface-variant/60 mt-2">Generated {fmtDate(data?.monitoring?.generated)}</p>
              </RecCard>
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  if (cell.status === "Ongoing") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">Ongoing</span>;
  return <span className="text-[11px] text-on-surface-variant/50">Not Started</span>;
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
const RecCard = ({ accent, icon, iconColor, title, children }) => (
  <div className={`border rounded-xl p-4 ${accent}`}>
    <div className="flex items-center gap-2 mb-2">
      <span className={`material-symbols-outlined text-base ${iconColor}`} style={fillStyle}>{icon}</span>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">{title}</p>
    </div>
    {children}
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
