import { useState, useEffect, useMemo } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { fetchAnnouncements } from "../../api/announcements.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// audience_role → badge style + icon (no category column exists in the schema)
const audienceStyles = {
  All:     { bg: "bg-blue-100",   text: "text-blue-700",   icon: "campaign" },
  Teacher: { bg: "bg-amber-100",  text: "text-amber-700",  icon: "groups"   },
  Student: { bg: "bg-purple-100", text: "text-purple-700", icon: "school"   },
  Parent:  { bg: "bg-green-100",  text: "text-green-700",  icon: "diversity_3" },
};

const PAGE_SIZE = 5;

// Render **bold** markdown in announcement content
const renderContent = (text = "") => {
  const parts = String(text).split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-bold text-on-surface">{part}</strong>
      : <span key={i}>{part}</span>
  );
};

export default function Announcements() {
  const schoolYearLabel       = useSchoolYear();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [sort, setSort]       = useState("recent"); // recent | oldest
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchAnnouncements();
        // Only active announcements from the principal reach a teacher (server filters
        // by role: audience_role All/Teacher); guard is_active here too.
        if (!cancelled) setItems((res.data ?? []).filter((a) => a.is_active !== false));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message ?? err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      const da = new Date(a.posted_date).getTime() || 0;
      const db = new Date(b.posted_date).getTime() || 0;
      return sort === "recent" ? db - da : da - db;
    });
    return list;
  }, [items, sort]);

  const shown   = sorted.slice(0, visible);
  const hasMore = visible < sorted.length;

  return (
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">Announcements</h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              All notifications and feedback from the principal regarding your reports.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-secondary text-base" style={fillStyle}>calendar_month</span>
            <span className="text-sm font-bold text-on-surface">{formatDate(new Date())}</span>
          </div>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center justify-end mb-5">
          <label className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="font-semibold">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="font-bold text-on-surface bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
            </select>
          </label>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 sm:p-10 text-center shadow-sm border border-outline-variant/20">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 block" style={fillStyle}>notifications_off</span>
            <p className="text-on-surface-variant text-sm font-bold">No announcements from the principal yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {shown.map((ann) => {
                const s = audienceStyles[ann.audience_role] ?? audienceStyles.All;
                const principalName = ann.principal
                  ? `${ann.principal.first_name ?? ""} ${ann.principal.last_name ?? ""}`.trim()
                  : "";
                return (
                  <article
                    key={ann.ann_id}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow flex gap-4"
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.text}`}>
                      <span className="material-symbols-outlined text-xl" style={fillStyle}>{s.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
                          {ann.audience_role ?? "All"}
                        </span>
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap shrink-0">{formatDate(ann.posted_date)}</span>
                      </div>
                      <h4 className="text-base font-extrabold text-on-surface leading-tight mt-2">{ann.title}</h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed mt-1.5">{renderContent(ann.content)}</p>
                      {principalName && (
                        <p className="text-[11px] text-on-surface-variant mt-2">Posted by {principalName}</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="flex items-center gap-2 px-6 py-3 rounded-full border border-outline-variant/30 text-sm font-bold text-primary hover:bg-surface-container-low transition-colors"
                >
                  View Older Announcements
                  <span className="material-symbols-outlined text-base">expand_more</span>
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </TeacherLayout>
  );
}
