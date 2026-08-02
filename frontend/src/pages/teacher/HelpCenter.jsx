// Supervisor (teacher) Help Center — full page (mirrors the student/principal Help
// Center: search + article accordion + "Still need help?" contact form). Rendered
// inside TeacherLayout; reached from the sidebar "Help Center" button (route /teacher/help).
import { useMemo, useState } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const MESSAGE_LIMIT = 500;
const PREVIEW_COUNT = 6;

const ARTICLES = [
  { icon: "menu_book", iconBg: "bg-blue-100", iconColor: "text-blue-600",
    title: "Viewing a Student's Projected PACE Plan",
    desc:  "Where to find each student's quarterly PACE projection and readiness status.",
    body:  "Open PACE Monitoring and select a student to see their projected PACE plan — the PACEs targeted for each subject per quarter, plus completed/remaining counts and whether they're ready for the PACE Test. The plan is generated from the student's diagnostic placement and approved by the principal." },
  { icon: "assignment_turned_in", iconBg: "bg-green-100", iconColor: "text-green-600",
    title: "Assigning & Managing PACEs",
    desc:  "How to assign the actual PACEs a student works on and update their status.",
    body:  "From PACE Monitoring, use Assign/Manage Student PACE to set the current PACE per subject with assigned, start, and expected-end dates. When a PACE is completed, mark it so the system records the completion date, completion status (On Time / Late / Extended), and performance points." },
  { icon: "fact_check", iconBg: "bg-purple-100", iconColor: "text-purple-600",
    title: "Recording Assessments (Self-Test & PACE Test)",
    desc:  "Recording Self-Test and PACE Test scores for each student's PACE.",
    body:  "Open Record Assessments, pick a student, and record scores per PACE. Passing is 90 and above. A student must pass the Self-Test (average ≥ 90) before the PACE Test unlocks. PACE Test scores are the official results that count toward the grade." },
  { icon: "group", iconBg: "bg-teal-100", iconColor: "text-teal-600",
    title: "Monitoring Student Progress",
    desc:  "Tracking pacing, completion, and readiness across your students.",
    body:  "Student Monitoring shows each student's PACE progress and readiness so you can see who is on track and who needs support. Use it to spot students falling behind their quarterly projection and follow up." },
  { icon: "speed", iconBg: "bg-orange-100", iconColor: "text-orange-600",
    title: "Understanding Readiness & Completion",
    desc:  "What 'PACE Test Ready' means and how completion status is decided.",
    body:  "A student is 'PACE Test Ready' for a subject when their Self-Test average reaches 90. On completion, a PACE is marked On Time if finished by its expected end date, Extended if an extension was granted, or Late otherwise — this drives the performance points used in analytics." },
  { icon: "lock_reset", iconBg: "bg-red-100", iconColor: "text-red-500",
    title: "Login & Account Help",
    desc:  "What to do if you can't log in or need to update your account.",
    body:  "Log in with your ID number and password. If your password stops working, ask the administrator to reset it. Update your name, email, and password anytime under Account Settings; the Accessibility tab there lets you adjust text size, contrast, and fonts." },
];

const SUBJECT_OPTIONS = [
  "General Question", "PACE Assignment", "Assessments & Scores",
  "Student Progress", "Account / Login Issue", "Other",
];

export default function HelpCenter() {
  const { user }        = useAuth();
  const schoolYearLabel = useSchoolYear();

  const [search,   setSearch]   = useState("");
  const [showAll,  setShowAll]  = useState(false);
  const [openIdx,  setOpenIdx]  = useState(null);

  const [name,    setName]    = useState(
    user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : user?.fullName || user?.username || ""
  );
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
    window.location.href = `mailto:support@lifegiver.edu.ph?subject=${encodeURIComponent(`[${subject}] LCA Supervisor Help`)}&body=${body}`;
    setFormError("");
    setSent(true);
    setMessage("");
    setSubject("");
  };

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-[860px] mx-auto w-full">

        {/* Header */}
        <header className="mb-6">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">Help Center</h2>
          <p className="text-on-surface-variant mt-1">Find answers and get help with using LCA Supervisor.</p>
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
    </TeacherLayout>
  );
}
