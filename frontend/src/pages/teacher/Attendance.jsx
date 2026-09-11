// Attendance page. Two modes: "today" (mark P/A/T/E + submit) and "history"
// (read-only past day). Load/save via fetchTeacherAttendance / submitTeacherAttendance
// (teacher.service.getAttendance / submitAttendance).
import { useState, useEffect } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchTeacherAttendance, fetchTeacherAttendanceHistory, submitTeacherAttendance } from "../../api/teacher.js";
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

// Convert cumulative daily records into Q1-Q4 monthly summary tables. All four
// quarter sections are shown with every record stored for the school year.
const buildQuarterAttendanceSections = (report) => {
  const startValue = report.attendanceBounds?.startDate;
  const endValue = report.attendanceBounds?.endDate;
  if (!startValue || !endValue) return [];

  const start = new Date(`${startValue}T00:00:00`);
  const roster = report.students?.length
    ? report.students
    : [...new Map((report.records ?? []).map((record) => [record.student_id, {
        student_id: record.student_id,
        name: record.name,
        grade: record.grade,
      }])).values()].sort((a, b) => a.name.localeCompare(b.name));

  const counts = new Map();
  (report.records ?? []).forEach((record) => {
    const monthKey = record.date_recorded?.slice(0, 7);
    if (!monthKey) return;
    const key = `${record.student_id}|${monthKey}`;
    const bucket = counts.get(key) ?? { present: 0, absent: 0, tardy: 0, excused: 0 };
    if (record.status === "present") bucket.present += 1;
    else if (record.status === "absent") bucket.absent += 1;
    else if (record.status === "late") bucket.tardy += 1;
    else if (record.status === "excused") bucket.excused += 1;
    counts.set(key, bucket);
  });

  return Array.from({ length: 4 }, (_, index) => {
    const quarter = index + 1;
    const quarterStart = new Date(start.getFullYear(), start.getMonth() + index * 3, 1);
    const months = Array.from({ length: 3 }, (__, monthOffset) => {
      const date = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + monthOffset, 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    });

    return {
      quarter,
      months,
      rows: roster.map((student) => ({
        ...student,
        months: months.map((month) => counts.get(`${student.student_id}|${month.key}`)
          ?? { present: 0, absent: 0, tardy: 0, excused: 0 }),
      })),
    };
  });
};

// ─── Mini Calendar ────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW    = ["M","T","W","T","F","S","S"]; // day-of-week headers (Monday-first)

// Sidebar month calendar. Days are coloured by that day's status (from `history`);
// onSelect(date) reloads that day. `view` tracks the shown month.
function MiniCalendar({ selectedDate, onSelect, history, minDate, maxDate }) {
  const [view, setView] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); // 1st of shown month

  const year   = view.getFullYear();
  const month  = view.getMonth();
  const days   = new Date(year, month + 1, 0).getDate();  // number of days in this month
  // offset = how many blank cells before day 1, so the 1st lands on the right weekday
  //   (JS getDay() is Sunday=0; this converts to a Monday-first grid).
  const offset = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  const todayStr = toDateStr(today);
  const selStr   = toDateStr(selectedDate);
  const previousMonthLast = toDateStr(new Date(year, month, 0));
  const nextMonthFirst = toDateStr(new Date(year, month + 1, 1));
  const canGoPrevious = !minDate || previousMonthLast >= minDate;
  const canGoNext = !maxDate || nextMonthFirst <= maxDate;

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-extrabold text-on-surface">{MONTHS[month]} {year}</span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setView(new Date(year, month - 1, 1))}
            disabled={!canGoPrevious}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button
            onClick={() => setView(new Date(year, month + 1, 1))}
            disabled={!canGoNext}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
          const disabled = (!!minDate && dateStr < minDate) || (!!maxDate && dateStr > maxDate);

          let cls = "w-8 h-8 mx-auto flex items-center justify-center text-xs font-bold rounded-full transition-all ";
          if (disabled)     cls += "text-on-surface-variant/30 cursor-not-allowed";
          else if (isSel)   cls += "bg-on-surface text-white shadow-md cursor-pointer";
          else if (isToday) cls += "bg-primary text-white cursor-pointer";
          else if (status)  cls += `${CAL_DOT[status] ?? "bg-green-400 text-white"} cursor-pointer`;
          else              cls += "text-on-surface hover:bg-surface-container-low cursor-pointer";

          return (
            <div key={day} className="flex items-center justify-center py-0.5">
              <button disabled={disabled} onClick={() => onSelect(new Date(year, month, day))} className={cls}>
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
  const [dateBounds,   setDateBounds]   = useState({ min: "", max: toDateStr(today) });
  const [students,     setStudents]     = useState([]);                       // students in this teacher's class
  const [log,          setLog]          = useState({});                       // per-student edits { id: {status,notes,time} }
  const [search,      setSearch]      = useState("");                         // name/ID search box text
  const [calHistory]                  = useState({});                         // date > status map that colours the calendar
  const [gradeLevels, setGradeLevels] = useState([]);
  const [summary,     setSummary]     = useState({ total: 0, present: 0, absent: 0, tardy: 0, excused: 0 }); // recorded tallies
  const [histPage,    setHistPage]    = useState(1);                          // History table page number
  const [loading,     setLoading]     = useState(false);                      // true while a day is loading
  const [historyActionLoading, setHistoryActionLoading] = useState(false);    // cumulative Print/Excel request
  const [historyActionError, setHistoryActionError] = useState("");
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
        setDateBounds({
          min: d.attendanceBounds?.startDate ?? "",
          max: d.attendanceBounds?.endDate ?? toDateStr(today),
        });
        setGradeLevels(d.gradeLevels ?? []);
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

  // These effects intentionally start the initial request and reset filter paging.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAttendance(today); }, []);                 // load today's attendance once on mount
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHistPage(1); }, [search]);                  // reset History paging when search changes

  // handleDaySelect - user picked a day (calendar / date input): remember it + reload.
  const handleDaySelect = (date) => {
    const value = toDateStr(date);
    if ((dateBounds.min && value < dateBounds.min) || (dateBounds.max && value > dateBounds.max)) return;
    setSelectedDate(date);
    setHistPage(1);
    loadAttendance(date);
  };

  // onDateInput - the <input type=date> value ("YYYY-MM-DD") > a local Date, then reload.
  const onDateInput = (value) => {
    if (!value) return;
    handleDaySelect(new Date(`${value}T00:00:00`));      // T00:00:00 forces LOCAL midnight (not UTC)
  };

  const gradeLabel = gradeLevels.length ? gradeLevels.join(", ") : "—";
  const todayValue = toDateStr(today);
  const editableMaxDate = dateBounds.max && dateBounds.max < todayValue ? dateBounds.max : todayValue;
  // pctOf - format a count as a % of today's total (guards divide-by-zero).
  const pctOf = (n) => (summary.total ? `${((n / summary.total) * 100).toFixed(1)}%` : "0%");

  // History view: recorded rows narrowed by search, then paginated.
  const histFiltered = students.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || String(s.student_id).includes(search);
    return matchSearch;
  });
  const histTotalPages = Math.max(1, Math.ceil(histFiltered.length / HIST_PAGE_SIZE));              // at least 1 page
  const histPageRows   = histFiltered.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE); // this page's rows

  // Print a clean cumulative report so the application chrome never appears on
  // paper. Open the window before awaiting data to avoid popup blockers.
  const printReport = async () => {
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      setHistoryActionError("Please allow pop-ups to print the attendance report.");
      return;
    }

    printWindow.opener = null;
    printWindow.document.write("<!doctype html><title>Preparing attendance report…</title><p style=\"font-family:Arial;padding:24px\">Preparing attendance report…</p>");
    setHistoryActionLoading(true);
    setHistoryActionError("");

    let report;
    try {
      const response = await fetchTeacherAttendanceHistory();
      report = response.data;
    } catch {
      printWindow.close();
      setHistoryActionError("Could not load the complete attendance history. Please try again.");
      setHistoryActionLoading(false);
      return;
    }

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    const rangeStart = report.attendanceBounds?.startDate ?? dateBounds.min;
    const rangeEnd = report.attendanceBounds?.endDate ?? todayValue;
    const rangeLabel = `${formatShort(new Date(`${rangeStart}T00:00:00`))} – ${formatShort(new Date(`${rangeEnd}T00:00:00`))}`;
    const reportGradeLabel = report.gradeLevels?.length ? report.gradeLevels.join(", ") : gradeLabel;
    const cumulativeSummary = report.summary ?? { total: 0, days: 0, present: 0, absent: 0, tardy: 0, excused: 0 };
    const quarterSections = buildQuarterAttendanceSections(report);
    const quarterTables = quarterSections.map((section) => {
      const monthHeaders = section.months.map((month) => `<th colspan="4">${escapeHtml(month.label)}</th>`).join("");
      const statusHeaders = section.months.map(() => "<th>P</th><th>A</th><th>T</th><th>E</th>").join("");
      const studentRows = section.rows.map((student) => {
        const monthCells = student.months.map((month) => `
          <td>${month.present}</td><td>${month.absent}</td><td>${month.tardy}</td><td>${month.excused}</td>`).join("");
        const total = student.months.reduce((sum, month) => sum + month.present + month.absent + month.tardy + month.excused, 0);
        return `<tr><td>${escapeHtml(student.student_id)}</td><td class="student-name">${escapeHtml(student.name)}</td>${monthCells}<td>${total}</td></tr>`;
      }).join("");
      const monthNames = section.months.map((month) => month.label.split(" ")[0]).join(" – ");
      const columnCount = 3 + section.months.length * 4;
      return `
        <section class="quarter-section">
          <h2>Quarter ${section.quarter} <span>${escapeHtml(monthNames)}</span></h2>
          <table>
            <thead>
              <tr><th rowspan="2">Student ID</th><th rowspan="2" class="student-column">Student Name</th>${monthHeaders}<th rowspan="2">Total</th></tr>
              <tr>${statusHeaders}</tr>
            </thead>
            <tbody>${studentRows || `<tr><td class="empty" colspan="${columnCount}">No students assigned.</td></tr>`}</tbody>
          </table>
        </section>`;
    }).join("");

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Attendance Report - ${escapeHtml(rangeStart)} to ${escapeHtml(rangeEnd)}</title>
          <style>
            @page { size: A4 landscape; margin: 14mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #102a43; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
            .report-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #102a43; padding-bottom: 12px; margin-bottom: 14px; }
            h1 { margin: 0 0 5px; font-size: 22px; letter-spacing: .04em; text-transform: uppercase; }
            .school { margin: 0; font-size: 13px; font-weight: 700; }
            .meta { margin: 3px 0 0; color: #52606d; }
            .prepared { text-align: right; line-height: 1.5; white-space: nowrap; }
            .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
            .summary-item { border: 1px solid #d9e2ec; border-radius: 6px; padding: 8px 10px; }
            .summary-label { color: #627d98; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
            .summary-value { display: block; margin-top: 3px; font-size: 17px; font-weight: 700; }
            .quarter-section { margin-top: 16px; break-inside: avoid; }
            .quarter-section + .quarter-section { break-before: page; }
            h2 { margin: 0 0 8px; font-size: 15px; text-transform: uppercase; }
            h2 span { color: #627d98; font-size: 11px; font-weight: 400; margin-left: 5px; text-transform: none; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #d9e2ec; padding: 7px 5px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
            th { background: #f0f4f8; color: #334e68; font-size: 9px; letter-spacing: .05em; text-transform: uppercase; }
            .student-column { width: 20%; }
            .student-name { font-weight: 700; text-align: left; }
            .empty { padding: 28px; color: #627d98; text-align: center; }
            .footer { margin-top: 10px; color: #7b8794; font-size: 9px; text-align: right; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <header class="report-header">
            <div>
              <h1>Attendance Report</h1>
              <p class="school">Lifegiver Christian Academy</p>
              <p class="meta">${escapeHtml(reportGradeLabel)} &bull; ${escapeHtml(rangeLabel)}</p>
            </div>
            <div class="prepared">
              <strong>Attendance Records History</strong><br />
              School Year: ${escapeHtml(schoolYearLabel)}
            </div>
          </header>
          <section class="summary">
            <div class="summary-item"><span class="summary-label">Recorded Days</span><span class="summary-value">${cumulativeSummary.days}</span></div>
            <div class="summary-item"><span class="summary-label">Total Entries</span><span class="summary-value">${cumulativeSummary.total}</span></div>
            <div class="summary-item"><span class="summary-label">Present</span><span class="summary-value">${cumulativeSummary.present}</span></div>
            <div class="summary-item"><span class="summary-label">Absent</span><span class="summary-value">${cumulativeSummary.absent}</span></div>
            <div class="summary-item"><span class="summary-label">Tardy</span><span class="summary-value">${cumulativeSummary.tardy}</span></div>
            <div class="summary-item"><span class="summary-label">Excused</span><span class="summary-value">${cumulativeSummary.excused}</span></div>
          </section>
          ${quarterTables || '<div class="empty">No elapsed quarters found.</div>'}
          <div class="footer">Generated ${escapeHtml(new Date().toLocaleString("en-US"))}</div>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      setHistoryActionLoading(false);
    }, 250);
  };

  // Export every saved active-school-year record, independent of the
  // selected date, search text, and table pagination.
  const exportExcel = async () => {
    setHistoryActionLoading(true);
    setHistoryActionError("");
    let report;
    try {
      const response = await fetchTeacherAttendanceHistory();
      report = response.data;
    } catch {
      setHistoryActionError("Could not load the complete attendance history. Please try again.");
      setHistoryActionLoading(false);
      return;
    }

    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rangeStart = report.attendanceBounds?.startDate ?? dateBounds.min;
    const rangeEnd = report.attendanceBounds?.endDate ?? todayValue;
    const quarterTables = buildQuarterAttendanceSections(report).map((section) => {
      const monthHeaders = section.months.map((month) => `<th colspan="4">${esc(month.label)}</th>`).join("");
      const statusHeaders = section.months.map(() => "<th>P</th><th>A</th><th>T</th><th>E</th>").join("");
      const rows = section.rows.map((student) => {
        const monthCells = student.months.map((month) => `
          <td>${month.present}</td><td>${month.absent}</td><td>${month.tardy}</td><td>${month.excused}</td>`).join("");
        const total = student.months.reduce((sum, month) => sum + month.present + month.absent + month.tardy + month.excused, 0);
        return `<tr><td>${esc(student.student_id)}</td><td>${esc(student.name)}</td><td>${esc(student.grade)}</td>${monthCells}<td>${total}</td></tr>`;
      }).join("");
      return `<h3>Quarter ${section.quarter}</h3><table border="1"><thead><tr><th rowspan="2">Student ID</th><th rowspan="2">Student Name</th><th rowspan="2">Grade</th>${monthHeaders}<th rowspan="2">Total</th></tr><tr>${statusHeaders}</tr></thead><tbody>${rows}</tbody></table><br>`;
    }).join("");
    const html = `<h2>Attendance Report</h2><p>Lifegiver Christian Academy<br>School Year: ${esc(schoolYearLabel)}<br>Date Range: ${esc(rangeStart)} to ${esc(rangeEnd)}</p>${quarterTables}`;
    const blob = new Blob([`\uFEFF<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], {
      type: "application/vnd.ms-excel",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_q1_to_${rangeEnd}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    setHistoryActionLoading(false);
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
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

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
            <label className="relative flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm cursor-pointer overflow-hidden">
              <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
              <span className="text-sm font-bold text-on-surface">{formatShort(selectedDate)}</span>
              <input
                type="date"
                value={toDateStr(selectedDate)}
                min={dateBounds.min || undefined}
                max={viewMode === "history" ? dateBounds.max : editableMaxDate}
                onChange={(e) => onDateInput(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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
                  className="w-full pl-9 pr-9 py-2 text-sm bg-surface-container-lowest border border-outline-variant/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {/* clear (×) -> empty the box */}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1 text-base text-on-surface-variant hover:text-on-surface cursor-pointer leading-none"
                  >close</button>
                )}
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
              minDate={dateBounds.min}
              maxDate={editableMaxDate}
            />

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-outline-variant/10">
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-3">Legend</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-3">
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
            date selector with Print/Export, and the recorded records
            table (status pills + remarks + time) with pagination. */}
        {viewMode === "history" && (
        <>
          {/* Stat cards (recorded summary) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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
              <input
                type="date"
                value={toDateStr(selectedDate)}
                min={dateBounds.min || undefined}
                max={dateBounds.max || undefined}
                onChange={(e) => onDateInput(e.target.value)}
                className="text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg px-3 py-2 min-w-[190px] focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button disabled={historyActionLoading} onClick={printReport} className="flex items-center gap-2 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-base">print</span> {historyActionLoading ? "Preparing…" : "Print All Quarters"}
              </button>
              <button disabled={historyActionLoading} onClick={exportExcel} className="flex items-center gap-2 text-sm font-bold text-white bg-primary rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-base">download</span> {historyActionLoading ? "Preparing…" : "Export All Quarters"}
              </button>
            </div>
          </div>

          {historyActionError && (
            <div className="mb-5 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
              <span className="material-symbols-outlined text-base">error</span>
              {historyActionError}
            </div>
          )}

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
