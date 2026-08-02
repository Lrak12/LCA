import { useState, useRef } from "react";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const ARTICLES = [
  {
    icon: "event_note",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Setting Up the Academic Calendar",
    desc: "Learn how to initialize a new school year and define the quarterly milestones that drive the system's pacing calculations.",
  },
  {
    icon: "fact_check",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    title: "Recording Diagnostic Scores & Initial Placement",
    desc: "Learn through the process of establishing a student's academic baseline upon enrollment.",
  },
  {
    icon: "bar_chart",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Managing the Quarterly Projections",
    desc: "Understand how the system determines where a student should be at the end of each quarter.",
  },
  {
    icon: "table_chart",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    title: "Archiving and Managing Historical Years",
    desc: "Ensuring data integrity when transitioning from one school year to the next.",
  },
  {
    icon: "speed",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "Supervisor Performance Oversight",
    desc: "Learn how to monitor the effectiveness of classroom supervisors and manage their access to student data.",
  },
  {
    icon: "notification_important",
    iconBg: "bg-red-100",
    iconColor: "text-red-500",
    title: "Managing New Student Enrollment",
    desc: "Learn the end-to-end process of adding a new student to the system and assigning them to the correct class.",
  },
];

const SUBJECT_OPTIONS = [
  "Select a subject",
  "Account & Access",
  "Academic Calendar",
  "Student Management",
  "Reports & Submissions",
  "Diagnostic Assessments",
  "Technical Issue",
  "Other",
];

const MAX_MSG = 500;

export default function HelpCenterModal({ onClose }) {
  const [search,  setSearch]  = useState("");
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [formErr, setFormErr] = useState("");

  const panelRef = useRef(null);

  const filtered = ARTICLES.filter(
    (a) =>
      search.trim() === "" ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.desc.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!name.trim())    { setFormErr("Please enter your name.");        return; }
    if (!email.trim())   { setFormErr("Please enter your email.");       return; }
    if (!subject || subject === "Select a subject") {
                           setFormErr("Please select a subject.");       return; }
    if (!message.trim()) { setFormErr("Please describe your concern.");  return; }
    setFormErr("");
    setSending(true);
    // Simulate send
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);
    setSent(true);
  };

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-[440px] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Close help center"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="px-6 pt-8 pb-5">
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Help Center</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Find answers and get help with using LCA Principal.
          </p>

          {/* Search */}
          <div className="relative mt-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search for help articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-on-surface placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            />
          </div>
        </div>

        {/* ── Help Articles ────────────────────────────────────── */}
        <div className="px-6 pb-2">
          <h3 className="text-xs font-extrabold tracking-widest uppercase text-on-surface mb-3">
            Help Articles
          </h3>

          <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
                No articles match your search.
              </div>
            ) : (
              filtered.map((article) => (
                <button
                  key={article.title}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors group"
                >
                  <div className={`w-9 h-9 rounded-lg ${article.iconBg} flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined text-base ${article.iconColor}`} style={fillStyle}>
                      {article.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface leading-tight">
                      {article.title}
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug line-clamp-2">
                      {article.desc}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-lg text-gray-300 group-hover:text-gray-400 shrink-0 transition-colors">
                    chevron_right
                  </span>
                </button>
              ))
            )}
          </div>

          <button className="w-full mt-3 mb-5 text-sm font-bold text-primary hover:underline text-center py-1">
            View all articles
          </button>
        </div>

        {/* ── Still need help? ─────────────────────────────────── */}
      </div>
    </div>
  );
}
