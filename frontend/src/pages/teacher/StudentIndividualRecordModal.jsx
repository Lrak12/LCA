import { useState } from "react";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10"];

const SUBJECTS = [
  {
    name: "MATHEMATICS",
    bg: "bg-yellow-50", text: "text-yellow-700",
    paces: [
      { no: 1048, q1: 98,  q2: 98,  q3: 98,  q4: 98  },
      { no: 1049, q1: 92,  q2: 92,  q3: 92,  q4: 92  },
      { no: 1050, q1: 100, q2: 100, q3: 100, q4: 100 },
    ],
  },
  {
    name: "ENGLISH",
    bg: "bg-pink-50", text: "text-pink-700",
    paces: [
      { no: 1048, q1: 95, q2: 95, q3: 95, q4: 95 },
      { no: 1049, q1: 92, q2: 92, q3: 92, q4: 92 },
      { no: 1050, q1: 96, q2: 96, q3: 96, q4: 96 },
    ],
  },
  {
    name: "SOCIAL STUDIES",
    bg: "bg-green-50", text: "text-green-700",
    paces: [
      { no: 1048, q1: 93, q2: 93, q3: 93, q4: 93 },
      { no: 1049, q1: 97, q2: 97, q3: 97, q4: 97 },
      { no: 1050, q1: 94, q2: 94, q3: 94, q4: 94 },
    ],
  },
  {
    name: "SCIENCE",
    bg: "bg-blue-50", text: "text-blue-700",
    paces: [
      { no: 1048, q1: 91, q2: 91, q3: 91, q4: 91 },
      { no: 1049, q1: 96, q2: 96, q3: 96, q4: 96 },
      { no: 1050, q1: 98, q2: 98, q3: 98, q4: 98 },
    ],
  },
  {
    name: "WORD BUILDING",
    bg: "bg-purple-50", text: "text-purple-700",
    paces: [
      { no: 1048, q1: 94, q2: 94, q3: 94, q4: 94 },
      { no: 1049, q1: 93, q2: 93, q3: 93, q4: 93 },
      { no: 1050, q1: 95, q2: 95, q3: 95, q4: 95 },
    ],
  },
  {
    name: "FILIPINO",
    bg: "bg-amber-50", text: "text-amber-700",
    paces: [
      { no: 1048, q1: 92, q2: 92, q3: 92, q4: 92 },
      { no: 1049, q1: 94, q2: 94, q3: 94, q4: 94 },
      { no: 1050, q1: 97, q2: 97, q3: 97, q4: 97 },
    ],
  },
  {
    name: "ARAL. PANLIP.",
    bg: "bg-emerald-50", text: "text-emerald-700",
    paces: [
      { no: 1048, q1: 90, q2: 90, q3: 90, q4: 90 },
      { no: 1049, q1: 91, q2: 91, q3: 91, q4: 91 },
      { no: 1050, q1: 93, q2: 93, q3: 93, q4: 93 },
    ],
  },
];

const round1 = (n) => Math.round(n * 10) / 10;

function subjectOverall(s) {
  const scores = s.paces.flatMap((p) => [p.q1, p.q2, p.q3, p.q4]);
  return {
    count: scores.length,
    avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
  };
}

function quarterStat(q) {
  const scores = SUBJECTS.flatMap((s) => s.paces.map((p) => p[q]));
  return {
    count: scores.length,
    avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
  };
}

const overallStat = (() => {
  const scores = SUBJECTS.flatMap((s) =>
    s.paces.flatMap((p) => [p.q1, p.q2, p.q3, p.q4])
  );
  return {
    count: scores.length,
    avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
  };
})();

const quarterAvg = (q) => {
  const subjectAvgs = SUBJECTS.map((s) => {
    const sc = s.paces.map((p) => p[q]);
    return sc.reduce((a, b) => a + b, 0) / sc.length;
  });
  return Math.round(subjectAvgs.reduce((a, b) => a + b, 0) / subjectAvgs.length);
};

const overallQuarterAvg = Math.round(
  ["q1","q2","q3","q4"].reduce((sum, q) => sum + quarterAvg(q), 0) / 4
);

// ─── Shared cell components ───────────────────────────────────────────────────
const TH = ({ children, rowSpan, colSpan, className = "" }) => (
  <th
    rowSpan={rowSpan}
    colSpan={colSpan}
    className={`border border-slate-300 px-2 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-wide bg-slate-700 text-white ${className}`}
  >
    {children}
  </th>
);

const TD = ({ children, className = "", align = "center" }) => (
  <td className={`border border-slate-200 px-2 py-1.5 text-xs text-${align} ${className}`}>
    {children}
  </td>
);

// ─── Filter dropdown ──────────────────────────────────────────────────────────
const FilterSelect = ({ value, onChange, options }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
    <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 15 }}>
      expand_more
    </span>
  </div>
);

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function StudentIndividualRecordModal({ onClose }) {
  const [grade,    setGrade]    = useState("Grade 7");
  const [date,     setDate]     = useState("5/15/2026");
  const [bibleMemory, setBibleMemory] = useState("Excellent");
  const [wpm,      setWpm]      = useState("145");
  const [comments, setComments] = useState(
    "Alessandra demonstrates excellent academic performance across all subjects. She is diligent, focused, and consistently completes her PACEs with high scores."
  );
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const studentName = "ALVIOLA, ALESSANDRA S.";
  const lrn         = "123456789012";

  const handleSaveDraft = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const qs = ["q1","q2","q3","q4"];
  const qLabels = ["1ST QUARTER","2ND QUARTER","3RD QUARTER","4TH QUARTER"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] my-4 flex flex-col">

        {/* ── Modal Header ───────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
          <div>
            <h2 className="text-xl font-extrabold text-on-surface">Student Individual Academic Record</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Quarterly academic record and subject performance.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest">
                Published
              </span>
              {saved
                ? <span className="text-green-600 font-bold">Saved just now</span>
                : <span>Last updated: May 15, 2025</span>
              }
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>

        {/* ── Filters Row ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-outline-variant/10 flex-wrap">
          {/* Student name chip */}
          <div className="flex items-center gap-2 border border-outline-variant/30 rounded-lg px-3 py-1.5 bg-slate-50">
            <span className="text-sm font-bold text-on-surface">{studentName}</span>
          </div>
          {/* LRN chip */}
          <div className="flex items-center gap-2 border border-outline-variant/30 rounded-lg px-3 py-1.5 bg-slate-50">
            <span className="text-sm font-bold text-on-surface">{lrn}</span>
          </div>
          <FilterSelect value={grade} onChange={setGrade} options={GRADES} />
          {/* Date */}
          <div className="relative">
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option>5/15/2026</option>
              <option>5/16/2026</option>
            </select>
            <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 15 }}>
              expand_more
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm font-bold text-green-600 border border-green-500 rounded-lg px-3 py-1.5 hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button className="flex items-center gap-1.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-3 py-1.5 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">edit</span>
              Edit
            </button>
            <button className="flex items-center gap-1.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-3 py-1.5 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">download</span>
              Export PDF
            </button>
            <button className="flex items-center gap-1.5 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-3 py-1.5 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">print</span>
              Print
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {/* Report container */}
          <div className="border border-slate-200 rounded-xl p-5">

            {/* Report info row */}
            <div className="flex items-center justify-between text-xs mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-6">
                <span><span className="text-on-surface-variant">Student Name: </span><span className="font-extrabold text-on-surface">{studentName}</span></span>
                <span><span className="text-on-surface-variant">Grade Level: </span><span className="font-extrabold text-on-surface">{grade.toUpperCase()}</span></span>
                <span><span className="text-on-surface-variant">LRN: </span><span className="font-extrabold text-on-surface">{lrn}</span></span>
              </div>
              <span><span className="text-on-surface-variant">School Year: </span><span className="font-extrabold text-on-surface">SY 2025–2026</span></span>
            </div>

            {/* ── Academic Table ──────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm min-w-[900px]">
                <thead>
                  {/* Row 1 */}
                  <tr>
                    <TH rowSpan={2} className="text-left px-3 min-w-[130px]">Subject</TH>
                    {qLabels.map((label) => (
                      <TH key={label} colSpan={2}>{label}</TH>
                    ))}
                    <TH colSpan={2}>Overall</TH>
                  </tr>
                  {/* Row 2 */}
                  <tr>
                    {[...Array(5)].map((_, i) => (
                      <>
                        <TH key={`pace-${i}`} className="text-[9px]">PACE #</TH>
                        <TH key={`avg-${i}`}  className="text-[9px]">PT AVG</TH>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SUBJECTS.map((subj) => {
                    const overall = subjectOverall(subj);
                    return subj.paces.map((pace, pi) => (
                      <tr key={`${subj.name}-${pi}`} className="hover:bg-slate-50/50">
                        {/* Subject label — only on first row */}
                        {pi === 0 && (
                          <td
                            rowSpan={3}
                            className={`border border-slate-200 px-3 py-2 text-xs font-extrabold text-left align-middle ${subj.bg} ${subj.text}`}
                          >
                            {subj.name}
                          </td>
                        )}
                        {/* Quarter scores */}
                        <TD className="text-on-surface-variant">{pace.no}</TD>
                        <TD className="font-bold text-on-surface">{pace.q1}</TD>
                        <TD className="text-on-surface-variant">{pace.no}</TD>
                        <TD className="font-bold text-on-surface">{pace.q2}</TD>
                        <TD className="text-on-surface-variant">{pace.no}</TD>
                        <TD className="font-bold text-on-surface">{pace.q3}</TD>
                        <TD className="text-on-surface-variant">{pace.no}</TD>
                        <TD className="font-bold text-on-surface">{pace.q4}</TD>
                        {/* Overall — only on first row */}
                        {pi === 0 && (
                          <>
                            <td
                              rowSpan={3}
                              className="border border-slate-200 px-2 py-1.5 text-xs font-extrabold text-center text-on-surface align-middle"
                            >
                              {overall.count}
                            </td>
                            <td
                              rowSpan={3}
                              className="border border-slate-200 px-2 py-1.5 text-xs font-extrabold text-center text-on-surface align-middle"
                            >
                              {overall.avg}
                            </td>
                          </>
                        )}
                      </tr>
                    ));
                  })}

                  {/* ── Footer rows ──────────────────────────────────── */}
                  {/* Total # of PACEs */}
                  <tr className="bg-slate-100">
                    <td className="border border-slate-300 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-on-surface">
                      Total # of PACEs
                    </td>
                    {qs.map((q) => {
                      const st = quarterStat(q);
                      return (
                        <td key={q} colSpan={2} className="border border-slate-300 px-2 py-2 text-xs font-extrabold text-center text-on-surface">
                          {st.count}
                        </td>
                      );
                    })}
                    <td colSpan={2} className="border border-slate-300 px-2 py-2 text-xs font-extrabold text-center text-on-surface">
                      {overallStat.count}
                    </td>
                  </tr>
                  {/* Total PT Average */}
                  <tr className="bg-slate-100">
                    <td className="border border-slate-300 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-on-surface">
                      Total PT Average
                    </td>
                    {qs.map((q) => {
                      const st = quarterStat(q);
                      return (
                        <td key={q} colSpan={2} className="border border-slate-300 px-2 py-2 text-xs font-extrabold text-center text-on-surface">
                          {st.avg}
                        </td>
                      );
                    })}
                    <td colSpan={2} className="border border-slate-300 px-2 py-2 text-xs font-extrabold text-center text-on-surface">
                      {overallStat.avg}
                    </td>
                  </tr>
                  {/* Quarter Average */}
                  <tr className="bg-slate-200">
                    <td className="border border-slate-300 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-on-surface">
                      Quarter Average
                    </td>
                    {qs.map((q) => (
                      <td key={q} colSpan={2} className="border border-slate-300 px-2 py-2 text-sm font-extrabold text-center text-on-surface">
                        {quarterAvg(q)}
                      </td>
                    ))}
                    <td colSpan={2} className="border border-slate-300 px-2 py-2 text-sm font-extrabold text-center text-on-surface bg-yellow-100">
                      {overallQuarterAvg}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Below table ─────────────────────────────────────────── */}
            <div className="mt-5 space-y-4">
              {/* Stats row */}
              <div className="flex items-center gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Number of PACEs Completed:</span>
                  <span className="font-extrabold text-on-surface border-b border-slate-400 px-2">{overallStat.count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Bible Memory:</span>
                  <select
                    value={bibleMemory}
                    onChange={(e) => setBibleMemory(e.target.value)}
                    className="text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {["Excellent","Very Good","Good","Satisfactory","Needs Improvement"].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Reading WPM:</span>
                  <input
                    type="number"
                    value={wpm}
                    onChange={(e) => setWpm(e.target.value)}
                    className="w-16 text-sm font-bold text-on-surface border border-outline-variant/30 rounded-lg px-2 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Supervisor Comments */}
              <div>
                <p className="text-sm font-bold text-on-surface mb-1.5">Supervisor Comments:</p>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="w-full text-sm text-on-surface border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              {/* Prepared by */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-200 text-sm">
                <span className="text-on-surface font-bold shrink-0">Prepared by:</span>
                <span className="border border-outline-variant/30 rounded-lg px-3 py-0.5 text-on-surface text-xs font-bold">
                  Hannah Mae M. Jaim
                </span>
                <span className="text-on-surface-variant ml-4">Date:</span>
                <span className="text-on-surface text-xs">{date}</span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center px-6 py-4 border-t border-outline-variant/20">
          <button className="flex items-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors rounded-xl px-4 sm:px-8 py-2.5 shadow-sm">
            <span className="material-symbols-outlined text-base" style={fillStyle}>upload</span>
            Send to Parent
          </button>
        </div>

      </div>
    </div>
  );
}
