// Attendance page. Two modes: "today" (mark P/A/T/E + submit) and "history"
// (read-only past day). Load/save via fetchTeacherAttendance / submitTeacherAttendance
// (teacher.service.getAttendance / submitAttendance).
import { useState, useEffect } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchTeacherAttendance, submitTeacherAttendance } from "../../api/teacher.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Status config ────────────────────────────────────────────────────────────
// STATUS_CFG - the 4 attendance buttons. Button key (P/A/T/E) maps to { db: the
//   exact value written to the DB, activeClass: the button's selected style }.
const STATUS_CFG = {
  P: { db: "Present", activeClass: "bg-green-500 text-white ring-2 ring-green-200"  },
  A: { db: "Absent",  activeClass: "bg-red-500   text-white ring-2 ring-red-200"   },
  T: { db: "Late",    activeClass: "bg-amber-400 text-white ring-2 ring-amber-200" },
  E: { db: "Excused", activeClass: "bg-blue-500  text-white ring-2 ring-blue-200"  },
};
// Reverse map: DB status (lowercase) > button key, used to preselect saved status.
const DB_TO_KEY   = { present: "P", absent: "A", late: "T", excused: "E" };
const INACTIVE_BTN = "border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low";

const CAL_DOT = {
  present: "bg-green-400 text-white",
  late:    "bg-amber-400 text-white",
  absent:  "bg-red-500   text-white",
  excused: "bg-blue-500  text-white",
};

const today      = new Date();
// toDateStr - local YYYY-MM-DD (built from local parts, NOT toISOString, to avoid
//   the UTC off-by-one that would shift the date in a +8 timezone).
const toDateStr  = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatFull = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); // "Monday, July 10, 2026"
const formatShort= (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });                 // "Jul 10, 2026"
// fmtTime - the "Last Updated" cell: clock time if updated today, "Yesterday",
//   else a short date.
const fmtTime    = (val) => {
  if (!val) return "—";
  if (typeof val === "string" && !val.includes("T")) return val;
  const d = new Date(val);
  if (isNaN(d)) return val;
  const diffDays = Math.floor((today - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};


// ─── History status pills ─────────────────────────────────────────────────────
// HIST_STATUS - how each recorded status renders in the read-only History table
//   (label shown, icon, dot colour, and text colours). Note "late" displays as "Tardy".
const HIST_STATUS = {
  present: { label: "Present", icon: "check",    dot: "bg-green-500", text: "text-green-600", remark: "text-on-surface-variant" },
  absent:  { label: "Absent",  icon: "close",    dot: "bg-red-500",   text: "text-red-600",   remark: "text-red-500" },
  late:    { label: "Tardy",   icon: "schedule", dot: "bg-amber-400", text: "text-amber-600", remark: "text-amber-600" },
  excused: { label: "Excused", icon: "info",     dot: "bg-blue-500",  text: "text-blue-600",  remark: "text-blue-600" },
};
const fmtClock = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};
const HIST_PAGE_SIZE = 10;

// ─── Mini Calendar ────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW    = ["M","T","W","T","F","S","S"]; // day-of-week headers (Monday-first)

// Sidebar month calendar. Days are coloured by that day's status (from `history`);
// onSelect(date) reloads that day. `view` tracks the shown month.
function MiniCalendar({ selectedDate, onSelect, history }) {
  const [view, setView] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); // 1st of shown month

  const year   = view.getFullYear();
  const month  = view.getMonth();
  const days   = new Date(year, month + 1, 0).getDate();  // number of days in this month
  // offset = how many blank cells before day 1, so the 1st lands on the right weekday
  //   (JS getDay() is Sunday=0; this converts to a Monday-first grid).
  const offset = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  const todayStr = toDateStr(today);
  const selStr   = toDateStr(selectedDate);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-extrabold text-on-surface">{MONTHS[month]} {year}</span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setView(new Date(year, month - 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button
            onClick={() => setView(new Date(year, month + 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-extrabold text-on-surface-variant uppercase pb-1">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSel   = dateStr === selStr;
          const isToday = dateStr === todayStr;
          const status  = history[dateStr];

          let cls = "w-8 h-8 mx-auto flex items-center justify-center text-xs font-bold rounded-full cursor-pointer transition-all ";
          if (isSel)        cls += "bg-on-surface text-white shadow-md";
          else if (isToday) cls += "bg-primary text-white";
          else if (status)  cls += (CAL_DOT[status] ?? "bg-green-400 text-white");
          else              cls += "text-on-surface hover:bg-surface-container-low";

          return (
            <div key={day} className="flex items-center justify-center py-0.5">
              <button onClick={() => onSelect(new Date(year, month, day))} className={cls}>
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// loadAttendance() fetches a day; handleSubmit() saves the Today marks.
export default function Attendance() {
  const schoolYearLabel = useSchoolYear();                                    // active SY label for the layout
  const [viewMode,     setViewMode]     = useState("today");                  // "today" (edit) | "history" (read-only)
  const [selectedDate, setSelectedDate] = useState(today);                    // which day is being viewed/edited
  const [students,     setStudents]     = useState([]);                       // students in this teacher's class
  const [log,          setLog]          = useState({});                       // per-student edits { id: {status,notes,time} }
  const [search,      setSearch]      = useState("");                         // name/ID search box text
  const [calHistory,  setCalHistory]  = useState({});                         // date > status map that colours the calendar
  const [gradeLevels, setGradeLevels] = useState([]);                         // grade-level names for the History filter
  const [gradeFilter, setGradeFilter] = useState("all");                      // selected grade filter (History)
  const [summary,     setSummary]     = useState({ total: 0, present: 0, absent: 0, tardy: 0, excused: 0 }); // recorded tallies
  const [histPage,    setHistPage]    = useState(1);                          // History table page number
  const [loading,     setLoading]     = useState(false);                      // true while a day is loading
  const [submitting,  setSubmitting]  = useState(false);                      // true while a submit is in flight
  const [submitDone,  setSubmitDone]  = useState(false);                      // shows the green success banner
  const [submitError, setSubmitError] = useState("");                         // shows the red error banner

  // loadAttendance - fetch one day's attendance and hydrate the page from it.
  //   keepDone=true keeps the success banner visible after a submit+reload.
  const loadAttendance = (date, keepDone = false) => {
    setLoading(true);
    if (!keepDone) setSubmitDone(false);                 // clear old success banner unless we just submitted
    fetchTeacherAttendance({ date: toDateStr(date) })    // GET /teacher/attendance?date=...
      .then((res) => {
        const d = res.data;
        setStudents(d.students ?? []);                   // class roster (+ any saved status)
        setGradeLevels(d.gradeLevels ?? []);             // grade names for the History filter
        setSummary(d.summary ?? { total: 0, present: 0, absent: 0, tardy: 0, excused: 0 });
        // Seed the editable `log` from saved statuses (DB value > button key).
        const newLog = {};
        (d.students ?? []).forEach((s) => {
          newLog[s.student_id] = { status: DB_TO_KEY[s.status] ?? null, notes: s.notes ?? "", time: null };
        });
        setLog(newLog);
      })
      .catch(() => {                                      // on error, reset to an empty day
        setStudents([]);
        setLog({});
        setSummary({ total: 0, present: 0, absent: 0, tardy: 0, excused: 0 });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAttendance(today); }, []);                 // load today's attendance once on mount
  useEffect(() => { setHistPage(1); }, [search, gradeFilter]);     // reset History paging when filters change

  // handleDaySelect - user picked a day (calendar / date input): remember it + reload.
  const handleDaySelect = (date) => {
    setSelectedDate(date);
    setHistPage(1);
    loadAttendance(date);
  };

  // onDateInput - the <input type=date> value ("YYYY-MM-DD") > a local Date, then reload.
  const onDateInput = (value) => {
    if (!value) return;
    handleDaySelect(new Date(`${value}T00:00:00`));      // T00:00:00 forces LOCAL midnight (not UTC)
  };

  // gradeLabel - subtitle text: the chosen grade, or all grades joined, or a dash.
  const gradeLabel = gradeFilter !== "all" ? gradeFilter : (gradeLevels.length ? gradeLevels.join(", ") : "—");
  // pctOf - format a count as a % of today's total (guards divide-by-zero).
  const pctOf = (n) => (summary.total ? `${((n / summary.total) * 100).toFixed(1)}%` : "0%");

  // History view: the recorded rows narrowed by search + grade, then paginated.
  const histFiltered = students.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || String(s.student_id).includes(search);
    const matchGrade  = gradeFilter === "all" || s.grade === gradeFilter;
    return matchSearch && matchGrade;
  });
  const histTotalPages = Math.max(1, Math.ceil(histFiltered.length / HIST_PAGE_SIZE));              // at least 1 page
  const histPageRows   = histFiltered.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE); // this page's rows

  const printReport = () => window.print(); // Print button > browser print dialog

  // exportExcel - build an HTML <table> of the filtered History rows and download
  //   it as a .xls file (Excel opens HTML tables). No server call - pure client-side.
  const exportExcel = () => {
    const head = ["Student ID", "Student Name", "Grade", "Status", "Remarks", "Time Recorded"];
    const body = histFiltered.map((s) => [
      s.student_id, s.name, s.grade ?? "",
      HIST_STATUS[s.status]?.label ?? "No Record",
      (s.notes ?? "").replace(/<[^>]*>/g, ""),
      fmtClock(s.time_recorded),
    ]);
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rowsHtml = [head, ...body]
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    const html = `<table>${rowsHtml}</table>`;
    const blob = new Blob([`﻿<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], {
      type: "application/vnd.ms-excel",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${toDateStr(selectedDate)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // markAllPresent - set every student's button to P in one click (local only).
  const markAllPresent = () => {
    const next = {};
    students.forEach((s) => { next[s.student_id] = { ...log[s.student_id], status: "P" }; });
    setLog(next);
    setSubmitDone(false);
  };

  // setStatus - one student's P/A/T/E button was clicked; update just their entry.
  const setStatus = (id, key) => {
    setLog((prev) => ({ ...prev, [id]: { ...prev[id], status: key } }));
    setSubmitDone(false);                                 // edits invalidate the "submitted" banner
  };

  // setNote - one student's note field changed; update just their entry.
  const setNote = (id, notes) => {
    setLog((prev) => ({ ...prev, [id]: { ...prev[id], notes } }));
  };

  // handleSubmit - save the day's attendance to the backend.
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    // Build the payload from ONLY the students who have a status set (skip unmarked),
    //   mapping the button key back to the DB value via STATUS_CFG.
    const records = students
      .filter((s) => log[s.student_id]?.status != null)
      .map((s) => ({
        student_id: s.student_id,
        status:     STATUS_CFG[log[s.student_id].status].db,   // "P" > "Present", etc.
        notes:      log[s.student_id].notes ?? "",
      }));
    if (!records.length) {                                 // nothing marked > show a hint, don't call the API
      setSubmitError("No students have been marked yet.");
      setSubmitting(false);
      return;
    }
    try {
      await submitTeacherAttendance({ date: toDateStr(selectedDate), records }); // POST /teacher/attendance
      setSubmitDone(true);                                 // green success banner
      loadAttendance(selectedDate, true);                  // reload to show saved values (keep banner)
    } catch {
      setSubmitError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Stats - the 4 Today stat cards, computed live from the editable `log`.
  const total      = students.length;
  const present    = Object.values(log).filter((r) => r.status === "P" || r.status === "E").length; // Present counts Excused too
  const absent     = Object.values(log).filter((r) => r.status === "A").length;
  const tardy      = Object.values(log).filter((r) => r.status === "T").length;
  const presentPct = total ? ((present / total) * 100).toFixed(1) : "0";
  const absentPct  = total ? ((absent  / total) * 100).toFixed(1) : "0";
  const tardyPct   = total ? ((tardy   / total) * 100).toFixed(1) : "0";

  // filtered - the Today table rows narrowed by the search box (name or ID).
  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    String(s.student_id).includes(search)
  );

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary uppercase">
              Attendance Records
            </h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              {gradeLabel}&nbsp;•&nbsp;{formatFull(selectedDate)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Today / History toggle */}
            <div className="flex items-center bg-white border border-outline-variant/20 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => { setViewMode("today"); handleDaySelect(today); }}
                className={`px-4 py-2.5 text-sm font-bold transition-colors ${viewMode === "today" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container-low"}`}
              >
                Today
              </button>
              <button
                onClick={() => setViewMode("history")}
                className={`px-4 py-2.5 text-sm font-bold transition-colors ${viewMode === "history" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container-low"}`}
              >
                History
              </button>
            </div>
            {/* Date picker */}
            <label className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm cursor-pointer">
              <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
              <span className="text-sm font-bold text-on-surface">{formatShort(selectedDate)}</span>
              <input
                type="date"
                value={toDateStr(selectedDate)}
                max={toDateStr(today)}
                onChange={(e) => onDateInput(e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* TODAY MODE - editable attendance: 4 live stat cards (from `log`), the
            attendance log table (P/A/T/E buttons + notes + Submit), and the mini
            calendar sidebar. */}
        {viewMode === "today" && (
        <>
        {/* ── Stat Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {/* Total Students */}
          <div className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20">
            <p className="text-sm text-on-surface-variant mb-3">Total Students</p>
            <div className="flex items-end gap-3">
              <p className="font-headline text-4xl font-extrabold text-on-surface">{total}</p>
              <span className="text-sm font-extrabold mb-1 text-blue-500">100%</span>
            </div>
          </div>
          {/* Present Today */}
          <div className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20 border-l-4 border-l-green-400">
            <p className="text-sm text-on-surface-variant mb-3">Present Today</p>
            <div className="flex items-end gap-3">
              <p className="font-headline text-4xl font-extrabold text-on-surface">{present}</p>
              <span className="text-sm font-extrabold mb-1 text-green-500">{presentPct}%</span>
            </div>
          </div>
          {/* Absent */}
          <div className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20 border-l-4 border-l-red-400">
            <p className="text-sm text-on-surface-variant mb-3">Absent</p>
            <div className="flex items-end gap-3">
              <p className="font-headline text-4xl font-extrabold text-on-surface">{absent}</p>
              <span className="text-sm font-extrabold mb-1 text-red-500">{absentPct}%</span>
            </div>
          </div>
          {/* Tardy */}
          <div className="bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20 border-l-4 border-l-amber-400">
            <p className="text-sm text-on-surface-variant mb-3">Tardy</p>
            <div className="flex items-end gap-3">
              <p className="font-headline text-4xl font-extrabold text-on-surface">{tardy}</p>
              <span className="text-sm font-extrabold mb-1 text-amber-500">{tardyPct}%</span>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ────────────────────────────────────────── */}
        <div className="flex gap-5 items-start">

          {/* ── Attendance Log ── */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden min-w-0">

            {/* Log toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10 flex-wrap">
              <span className="text-sm font-extrabold text-on-surface whitespace-nowrap">Attendance Log</span>
              <div className="relative flex-1 min-w-[140px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={markAllPresent}
                className="text-sm font-bold text-on-surface border border-outline-variant/30 px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors whitespace-nowrap"
              >
                Mark All Present
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm shadow-primary/20 whitespace-nowrap"
              >
                {submitting
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : null
                }
                {submitting ? "Saving…" : "Submit Attendance"}
              </button>
            </div>

            {submitDone && (
              <div className="mx-5 mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-2.5">
                <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>
                Attendance submitted successfully.
              </div>
            )}
            {submitError && (
              <div className="mx-5 mt-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
                <span className="material-symbols-outlined text-base">error</span>
                {submitError}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant/10">
                    {["Student Name", "Status", "Notes", "Last Updated"].map((h) => (
                      <th key={h} className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-5 py-3 text-left whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 4 }).map((__, j) => (
                          <td key={j} className="px-5 py-5">
                            <div className="animate-pulse bg-surface-container-high rounded h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                        No students found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => {
                      const entry  = log[s.student_id] ?? { status: null, notes: "", time: null };
                      const cur    = entry.status;
                      const noteColor =
                        cur === "A" ? "text-red-500"   :
                        cur === "T" ? "text-amber-600" :
                        cur === "E" ? "text-blue-600"  : "text-on-surface";
                      return (
                        <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                          {/* Name */}
                          <td className="px-5 py-4 min-w-[160px]">
                            <p className="text-sm font-extrabold text-on-surface leading-tight">{s.name}</p>
                            <p className="text-[11px] text-on-surface-variant">ID: {s.student_id}</p>
                          </td>

                          {/* P / A / T / E buttons */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                                <button
                                  key={key}
                                  title={cfg.db}
                                  onClick={() => setStatus(s.student_id, key)}
                                  className={`w-8 h-8 rounded-full text-xs font-extrabold transition-all flex items-center justify-center ${
                                    cur === key ? cfg.activeClass : INACTIVE_BTN
                                  }`}
                                >
                                  {key}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Notes */}
                          <td className="px-5 py-4 min-w-[180px]">
                            <input
                              type="text"
                              placeholder="Add note..."
                              value={entry.notes}
                              onChange={(e) => setNote(s.student_id, e.target.value)}
                              className={`text-sm w-full bg-transparent focus:outline-none placeholder:text-on-surface-variant/40 ${entry.notes ? noteColor : ""}`}
                            />
                          </td>

                          {/* Last Updated */}
                          <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                            {entry.time ?? fmtTime(s.updated_at) ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Availability Calendar ── */}
          <div className="w-72 shrink-0 bg-white rounded-2xl shadow-sm border border-outline-variant/20 p-5">
            <h3 className="text-base font-extrabold text-on-surface mb-1">Availability Calendar</h3>
            <p className="text-[11px] text-on-surface-variant mb-5 leading-snug">
              Select a date to view students attendance summary
            </p>

            <MiniCalendar
              selectedDate={selectedDate}
              onSelect={handleDaySelect}
              history={calHistory}
            />

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-outline-variant/10">
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">Legend</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                {[
                  { dot: "bg-green-400", label: "Present"  },
                  { dot: "bg-amber-400", label: "Late"     },
                  { dot: "bg-red-500",   label: "Absent"   },
                  { dot: "bg-on-surface",label: "Selected" },
                  { dot: "bg-blue-500",  label: "Excused"  },
                ].map(({ dot, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    <span className="text-[11px] text-on-surface-variant">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected date */}
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-2">
                Selected Date
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-on-surface shrink-0" />
                <span className="text-xs font-bold text-on-surface flex-1 leading-snug">
                  {formatFull(selectedDate)}
                </span>
                <span className="text-[10px] font-extrabold tracking-widest uppercase bg-primary text-white px-2 py-0.5 rounded shrink-0">
                  {toDateStr(selectedDate) === toDateStr(today) ? "Today" : "Selected"}
                </span>
              </div>
            </div>
          </div>

        </div>
        </>
        )}

        {/* ════════════════════════ HISTORY VIEW ════════════════════════ */}
        {/* HISTORY MODE - read-only: recorded stat cards (from `summary`), a
            date + grade filter bar with Print/Export, and the recorded records
            table (status pills + remarks + time) with pagination. */}
        {viewMode === "history" && (
        <>
          {/* Stat cards (recorded summary) */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Students", value: summary.total,   pct: "100%",            accent: "",                          pill: "bg-blue-50 text-blue-600"  },
              { label: "Present Today",  value: summary.present,  pct: pctOf(summary.present), accent: "border-l-4 border-l-green-400", pill: "bg-green-50 text-green-600" },
              { label: "Absent",         value: summary.absent,   pct: pctOf(summary.absent),  accent: "border-l-4 border-l-red-400",   pill: "bg-red-50 text-red-600"   },
              { label: "Tardy",          value: summary.tardy,    pct: pctOf(summary.tardy),   accent: "border-l-4 border-l-amber-400", pill: "bg-amber-50 text-amber-600" },
            ].map((c) => (
              <div key={c.label} className={`bg-white rounded-2xl px-6 py-5 shadow-sm border border-outline-variant/20 ${c.accent}`}>
                <p className="text-sm text-on-surface-variant mb-3">{c.label}</p>
                <div className="flex items-end justify-between">
                  <p className="font-headline text-4xl font-extrabold text-on-surface">{c.value}</p>
                  <span className={`text-xs font-extrabold px-2 py-1 rounded-lg ${c.pill}`}>{c.pct}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 px-5 py-4 mb-5 flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Date</label>
              <label className="flex items-center gap-2 bg-white border border-outline-variant/30 rounded-lg px-3 py-2 cursor-pointer min-w-[190px]">
                <span className="material-symbols-outlined text-on-surface-variant text-base">calendar_month</span>
                <span className="text-sm font-bold text-on-surface flex-1">{formatShort(selectedDate)}</span>
                <input type="date" value={toDateStr(selectedDate)} max={toDateStr(today)} onChange={(e) => onDateInput(e.target.value)} className="sr-only" />
                <span className="material-symbols-outlined text-on-surface-variant text-base">expand_more</span>
              </label>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1.5">Grade Level</label>
              <div className="relative">
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg pl-3 pr-9 py-2 min-w-[170px] focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                >
                  <option value="all">All Grade Levels</option>
                  {gradeLevels.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-base">expand_more</span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={printReport} className="flex items-center gap-2 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-base">print</span> Print Attendance Report
              </button>
              <button onClick={exportExcel} className="flex items-center gap-2 text-sm font-bold text-white bg-primary rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors shadow-sm">
                <span className="material-symbols-outlined text-base">download</span> Export (Excel)
              </button>
            </div>
          </div>

          {/* Records table */}
          <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-lowest border-b border-outline-variant/10">
                    {["Student ID", "Student Name", "Status", "Remarks", "Time Recorded"].map((h, i) => (
                      <th key={h} className={`text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant px-6 py-4 whitespace-nowrap ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-6 py-5"><div className="animate-pulse bg-surface-container-high rounded h-4 w-full" /></td>
                      ))}</tr>
                    ))
                  ) : histPageRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-on-surface-variant">No attendance records for this date.</td></tr>
                  ) : histPageRows.map((s) => {
                    const cfg = HIST_STATUS[s.status];
                    return (
                      <tr key={s.student_id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{s.student_id}</td>
                        <td className="px-6 py-4 text-sm font-extrabold text-on-surface">{s.name}</td>
                        <td className="px-6 py-4">
                          {cfg ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center ${cfg.dot}`}>
                                <span className="material-symbols-outlined text-white" style={{ fontSize: 13, ...fillStyle }}>{cfg.icon}</span>
                              </span>
                              <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-on-surface-variant">No record</span>
                          )}
                        </td>
                        <td className={`px-6 py-4 text-sm ${s.notes?.trim() ? (cfg?.remark ?? "text-on-surface-variant") : "text-on-surface-variant"}`}>
                          {s.notes?.trim() ? s.notes : "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant text-right whitespace-nowrap">{fmtClock(s.time_recorded)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant/10 flex-wrap gap-3">
              <p className="text-sm text-on-surface-variant">
                {histFiltered.length === 0
                  ? "No students"
                  : `Showing ${(histPage - 1) * HIST_PAGE_SIZE + 1} to ${Math.min(histPage * HIST_PAGE_SIZE, histFiltered.length)} of ${histFiltered.length} students`}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setHistPage((p) => Math.max(1, p - 1))} disabled={histPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                {Array.from({ length: histTotalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                  <button key={p} onClick={() => setHistPage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${p === histPage ? "bg-primary text-white" : "border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"}`}>{p}</button>
                ))}
                <button onClick={() => setHistPage((p) => Math.min(histTotalPages, p + 1))} disabled={histPage === histTotalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </>
        )}
      </main>
    </TeacherLayout>
  );
}
