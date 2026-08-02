// Principal Help Center — full page (mirrors the student Help Center structure:
// search + article accordion + "Still need help?" contact form). Rendered inside
// PrincipalLayout; reached from the sidebar "Help Center" button (route /admin/help).
import { useMemo, useState } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const MESSAGE_LIMIT = 500;
const PREVIEW_COUNT = 6;

const ARTICLES = [
  { icon: "event_note", iconBg: "bg-blue-100", iconColor: "text-blue-600",
    title: "Setting Up the Academic Calendar",
    desc:  "Learn how to initialize a new school year and define the quarterly milestones that drive the system's pacing calculations.",
    body:  "Create a school year and set its start and end dates. The system derives the four quarter date ranges automatically from the start date, and those ranges drive every pacing and readiness calculation. Only one school year can be active at a time — activating a new one archives the previous." },
  { icon: "fact_check", iconBg: "bg-green-100", iconColor: "text-green-600",
    title: "Recording Diagnostic Scores & Initial Placement",
    desc:  "Walk through the process of establishing a student's academic baseline upon enrollment.",
    body:  "Open Diagnostic Assessment, create a new student assessment, and record the student's diagnostic scores per subject. The system uses these results to generate a projected PACE recommendation, which you review and approve to set the student's starting PACE for each subject." },
  { icon: "bar_chart", iconBg: "bg-purple-100", iconColor: "text-purple-600",
    title: "Managing the Quarterly Projections",
    desc:  "Understand how the system determines where a student should be at the end of each quarter.",
    body:  "The projected PACE plan lays out how many PACEs a student should complete each quarter per subject. You can review and adjust the projection; supervisors then assign the actual PACEs against it. Readiness and progress are measured against these quarterly targets." },
  { icon: "table_chart", iconBg: "bg-teal-100", iconColor: "text-teal-600",
    title: "Archiving and Managing Historical Years",
    desc:  "Ensuring data integrity when transitioning from one school year to the next.",
    body:  "When a school year ends, activating the next year archives the current one so its records stay intact and read-only. Historical data remains available for reporting; only the active year accepts new records." },
  { icon: "speed", iconBg: "bg-orange-100", iconColor: "text-orange-600",
    title: "Supervisor Performance Oversight",
    desc:  "Learn how to monitor the effectiveness of classroom supervisors and manage their access to student data.",
    body:  "Use Supervisor Management and Student Monitoring to review how each supervisor's students are progressing — completion rates, readiness, and pacing. This helps you identify where additional support is needed." },
  { icon: "notification_important", iconBg: "bg-red-100", iconColor: "text-red-500",
    title: "Managing New Student Enrollment",
    desc:  "Learn the end-to-end process of adding a new student to the system and assigning them to the correct class.",
    body:  "Add new students through Diagnostic Assessment → Create New Student Assessment. Fill in the student and parent/guardian details, and the system generates login credentials (login is the Student ID number). Assign the student to a grade level so their supervisor can begin assigning PACEs." },
];

const SUBJECT_OPTIONS = [
  "Account & Access", "Academic Calendar", "Student Management",
  "Reports & Submissions", "Diagnostic Assessments", "Technical Issue", "Other",
];

export default function HelpCenter() {
  const { user }        = useAuth();
  const schoolYearLabel = useSchoolYear();

  const [search,   setSearch]   = useState("");
  const [showAll,  setShowAll]  = useState(false);
  const [openIdx,  setOpenIdx]  = useState(null);

  const [name,    setName]    = useState(user?.fullName || user?.username || "");
  const [email,   setEmail]   = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [sent,      setSent]      = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ARTICLES;
    return ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q)
    );
  }, [search]);

  const visible = search || showAll ? filtered : filtered.slice(0, PREVIEW_COUNT);

  const handleSend = (e) => {
    e.preventDefault();
    setSent(false);
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      setFormError("Please fill in all fields before sending.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    const body = encodeURIComponent(`From: ${name} (${email})\n\n${message}`);
    window.location.href = `mailto:support@lifegiver.edu.ph?subject=${encodeURIComponent(`[${subject}] LCA Principal Help`)}&body=${body}`;
    setFormError("");
    setSent(true);
    setMessage("");
    setSubject("");
  };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-[860px] mx-auto w-full">

        {/* Header */}
        <header className="mb-6">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">Help Center</h2>
          <p className="text-on-surface-variant mt-1">Find answers and get help with using LCA Principal.</p>
        </header>

        {/* Search */}
        <div className="relative mb-8">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1 text-on-surface-variant text-xl">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpenIdx(null); }}
            placeholder="Search for help articles..."
            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-outline-variant/30 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Help Articles */}
        <h3 className="text-base font-extrabold text-on-surface mb-3">Help Articles</h3>
        <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden mb-10">
          {visible.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-on-surface-variant">
              No articles match “{search}”. Try a different keyword or send us a message below.
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/10">
              {visible.map((a, i) => {
                const isOpen = openIdx === i;
                return (
                  <div key={a.title}>
                    <button
                      onClick={() => setOpenIdx(isOpen ? null : i)}
                      className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-surface-container-lowest transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.iconBg}`}>
                        <span className={`material-symbols-outlined text-xl ${a.iconColor}`} style={fillStyle}>{a.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-on-surface">{a.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{a.desc}</p>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant text-lg shrink-0">
                        {isOpen ? "expand_less" : "chevron_right"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 pl-20">
                        <p className="text-sm text-on-surface-variant leading-relaxed">{a.body}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!search && filtered.length > PREVIEW_COUNT && (
            <div className="border-t border-outline-variant/10">
              <button
                onClick={() => { setShowAll((v) => !v); setOpenIdx(null); }}
                className="w-full py-3.5 text-sm font-bold text-blue-600 hover:bg-surface-container-lowest transition-colors"
              >
                {showAll ? "Show fewer articles" : "View all articles"}
              </button>
            </div>
          )}
        </article>
        
      </main>
    </PrincipalLayout>
  );
}
