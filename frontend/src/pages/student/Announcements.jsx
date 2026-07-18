import { useState, useEffect } from "react";
import StudentLayout from "../../components/StudentLayout.jsx";
import { fetchStudentAnnouncements } from "../../api/student.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const categoryStyles = {
  All:     { bg: "bg-blue-100",   text: "text-blue-700"   },
  Student: { bg: "bg-purple-100", text: "text-purple-700" },
  Teacher: { bg: "bg-amber-100",  text: "text-amber-700"  },
  Parent:  { bg: "bg-green-100",  text: "text-green-700"  },
  General: { bg: "bg-slate-100",  text: "text-slate-600"  },
};

const CategoryBadge = ({ category }) => {
  const s = categoryStyles[category] ?? categoryStyles.General;
  return (
    <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full shrink-0 ${s.bg} ${s.text}`}>
      {category}
    </span>
  );
};

const PAGE_SIZE = 5;

export default function Announcements() {
  const { user }                  = useAuth();
  const schoolYearLabel           = useSchoolYear();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [visible, setVisible]     = useState(PAGE_SIZE);

  useEffect(() => {
    fetchStudentAnnouncements()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name ?? user?.username ?? "Student";

  const announcements = data?.announcements ?? [
    {
      id: 1,
      title:    "Submission of Incomplete PACEs",
      postedAt: "June 26, 2026 • 02:45 PM",
      category: "Achievement",
      content:  "Students with incomplete PACE modules are encouraged to submit pending activities on or before **July 1, 2026** to avoid delays in assessment scheduling.",
    },
    {
      id: 2,
      title:    "PACE Test Schedule Released",
      postedAt: "June 26, 2026 • 02:30 PM",
      category: "Reminder",
      content:  "Students are advised to complete all assigned self-tests and check-up activities before the scheduled PACE examination on **July 1, 2026.**",
    },
    {
      id: 3,
      title:    "Parent Meeting Reminder",
      postedAt: "June 26, 2026 • 12:15 PM",
      category: "Reminder",
      content:  "A parent meeting will be held on **June 28, 2026** at the school conference room to discuss student academic progress and upcoming school activities.",
    },
    {
      id: 4,
      title:    "No Classes on June 30",
      postedAt: "June 26, 2026 • 8:00 AM",
      category: "No Class",
      content:  "Classes and office operations are suspended on **June 30, 2026** due to scheduled school facility maintenance.",
    },
  ];

  const shown    = announcements.slice(0, visible);
  const hasMore  = visible < announcements.length;

  // Render content with **bold** markdown
  const renderContent = (text) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <strong key={i} className="font-bold text-on-surface">{part}</strong>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">
              {getGreeting()}, {firstName}.
            </h2>
            <p className="text-on-surface-variant mt-1 max-w-lg">
              Stay informed with the latest school updates, reminders, and
              important notices from your teachers and administrators.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate()}</span>
          </div>
        </header>

        {/* ── Announcements ────────────────────────────────────────── */}
        <section>
          <h3 className="font-headline text-2xl font-extrabold text-primary mb-5">Announcements</h3>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 sm:p-10 text-center shadow-sm border border-outline-variant/20">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 block" style={fillStyle}>notifications_off</span>
              <p className="text-on-surface-variant text-sm font-bold">No announcements at this time.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {shown.map((ann) => (
                  <article
                    key={ann.id}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h4 className="text-base font-extrabold text-on-surface leading-tight">{ann.title}</h4>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">{ann.postedAt}</p>
                      </div>
                      <CategoryBadge category={ann.category} />
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
                      {renderContent(ann.content)}
                    </p>
                  </article>
                ))}
              </div>

              {hasMore && (
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="mt-6 w-full py-3 rounded-2xl border border-outline-variant/30 text-sm font-bold text-primary hover:bg-surface-container-low transition-colors"
                >
                  View Older Announcements
                </button>
              )}
            </>
          )}
        </section>

      </main>
    </StudentLayout>
  );
}
