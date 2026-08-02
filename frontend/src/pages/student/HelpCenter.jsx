import { useMemo, useState } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const MESSAGE_LIMIT = 500;
const PREVIEW_COUNT = 6;

const ARTICLES = [
  {
    icon: "quiz", iconBg: "bg-blue-100", iconColor: "text-blue-600",
    title: "How to View Your Test Scores",
    desc:  "A guide to finding your Check-Up, Self-Test, and PACE Test results.",
    body:  "Open Assessment Results from the sidebar to see every score your teacher has recorded. Check-Ups and Self-Tests are practice assessments — they show whether you are ready for the official test. The PACE Test is the official score that counts toward your grade. Use the subject and quarter filters at the top to find a specific result.",
  },
  {
    icon: "menu_book", iconBg: "bg-green-100", iconColor: "text-green-600",
    title: "Understanding Your PACE Progress",
    desc:  "How to read your progress bars and see what PACE number you are currently on.",
    body:  "The PACE Progress page shows each subject with the PACE numbers assigned to you this school year. A green segment means the PACE is completed, orange means it is in progress, and gray means it has not been started. Your current PACE is the first one that is not yet completed in each subject.",
  },
  {
    icon: "campaign", iconBg: "bg-purple-100", iconColor: "text-purple-600",
    title: "Announcements & School News",
    desc:  "Where to find important updates from your supervisors and the Academy.",
    body:  "Click Announcements in the sidebar to read updates posted by the school. The newest announcements appear at the top. Check this page regularly — schedule changes, events, and reminders from your supervisors are posted here first.",
  },
  {
    icon: "event_available", iconBg: "bg-cyan-100", iconColor: "text-cyan-600",
    title: "Tracking Your Attendance",
    desc:  "How to check your daily time logs and see your overall attendance percentage.",
    body:  "The Attendance page lists every school day of the selected month with your status: Present, Late, Absent, or Excused. Weekends and days without class show as No Class. Your Attendance Rate is the percentage of recorded school days you were present, late, or excused — use the month dropdown to review past months.",
  },
  {
    icon: "grade", iconBg: "bg-amber-100", iconColor: "text-amber-600",
    title: "Reading Your Grades",
    desc:  "Learn how your PACE scores are averaged into your final subject grades.",
    body:  "Each quarter you take up to three PACE Tests per subject. Your Quarter Average is the average of those three scores, and a subject is marked Passed when the average is 90 or above. Your General Average is the average of all your subject averages for the quarter. Switch quarters with the dropdown on the Grades page.",
  },
  {
    icon: "lock_reset", iconBg: "bg-red-100", iconColor: "text-red-500",
    title: "Troubleshooting Login Issues",
    desc:  "What to do if you can't access your dashboard or see your latest scores.",
    body:  "Make sure you are logging in with your Student ID number (not your name or email) and the password given to you. If your password no longer works, ask your teacher or the school administrator to reset it. If you can log in but scores look missing, your teacher may not have recorded them yet — check back after class or send us a message below.",
  },
  {
    icon: "settings_accessibility", iconBg: "bg-indigo-100", iconColor: "text-indigo-600",
    title: "Making the Site Easier to Read",
    desc:  "Use the Accessibility settings to change text size, contrast, and fonts.",
    body:  "Go to Account Settings and open the Accessibility tab. There you can make text bigger, switch to High Contrast or Dark mode, scale tables, and pick a dyslexic-friendly font. Changes apply immediately and are remembered on this device.",
  },
  {
    icon: "manage_accounts", iconBg: "bg-teal-100", iconColor: "text-teal-600",
    title: "Updating Your Profile",
    desc:  "How to change your name, email address, and password.",
    body:  "Open Account Settings from the sidebar. Under Profile Settings you can edit your name and email, and the Password & Security section lets you change your password (it must be at least 8 characters). Grade and section are managed by the school and cannot be edited.",
  },
];

const SUBJECT_OPTIONS = [
  "General Question",
  "Grades & Scores",
  "PACE Progress",
  "Attendance",
  "Account / Login Issue",
  "Other",
];

export default function HelpCenter() {
  const { user }        = useAuth();
  const schoolYearLabel = useSchoolYear();

  const [search,   setSearch]   = useState("");
  const [showAll,  setShowAll]  = useState(false);
  const [openIdx,  setOpenIdx]  = useState(null);

  const [name,    setName]    = useState(
    user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : ""
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
    // No support backend yet — open the user's mail app with the message prefilled
    const body = encodeURIComponent(`From: ${name} (${email})\n\n${message}`);
    window.location.href = `mailto:support@lifegiver.edu.ph?subject=${encodeURIComponent(`[${subject}] LCA Student Help`)}&body=${body}`;
    setFormError("");
    setSent(true);
    setMessage("");
    setSubject("");
  };

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-[860px] mx-auto w-full">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="mb-6">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
            Help Center
          </h2>
          <p className="text-on-surface-variant mt-1">
            Find answers and get help with using LCA Student.
          </p>
        </header>

        {/* ── Search ─────────────────────────────────────────────── */}
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

        {/* ── Help Articles ──────────────────────────────────────── */}
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
    </StudentLayout>
  );
}
