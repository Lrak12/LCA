// Announcements (student): "View announcements". Read-only list of the announcements the
// principal/admin posted for students, newest first, paged locally (PAGE_SIZE at a time).
//
// Backend chain (load):
//   useEffect -> fetchStudentAnnouncements (api/student.js)    GET /student/announcements
//     -> routes/student.routes.js (requireRole "student")
//     -> controllers/student.controller.js > getAnnouncements (~line 78)
//     -> services/student.service.js > getStudentAnnouncements (~line 343)
//          - student      : the greeting name
//          - announcement : is_active = true AND audience_role in (All, Student),
//                           ordered by posted_date desc
//   Returns the list; the page only displays it (no writes from the student side).
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import StudentLayout from "../../components/StudentLayout.jsx";
import AnnouncementMessageModal from "../../components/AnnouncementMessageModal.jsx";
import { announcementTone, compareAnnouncements, formatAnnouncementTimestamp } from "../../utils/announcementFeed.js";
import { fetchStudentAnnouncements } from "../../api/student.js";
import { markNotificationRead } from "../../api/notifications.js";
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

const PAGE_SIZE = 5;

export default function Announcements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAnnouncementId = Number(searchParams.get("announcement"));
  const { user }                  = useAuth();
  const schoolYearLabel           = useSchoolYear();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [visible, setVisible]     = useState(PAGE_SIZE);

  // Load once on mount: GET /student/announcements (see backend chain at top).
  useEffect(() => {
    fetchStudentAnnouncements()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.first_name ?? user?.username ?? "Student";

  const announcements = [...(data?.announcements ?? [])].sort(compareAnnouncements);

  const selectedIndex = announcements.findIndex((announcement) => announcement.id === selectedAnnouncementId);
  const selectedAnnouncement = selectedIndex >= 0 ? announcements[selectedIndex] : null;
  const shown    = announcements.slice(0, Math.max(visible, selectedIndex + 1));
  const hasMore  = shown.length < announcements.length;

  const openAnnouncement = (id) => {
    const announcement = announcements.find((item) => item.id === id);
    if (announcement && !announcement.is_read && announcement.notification_id) {
      setData((current) => current ? {
        ...current,
        announcements: (current.announcements ?? []).map((item) => item.id === id ? { ...item, is_read: true } : item),
      } : current);
      markNotificationRead(announcement.notification_id).catch(() => { /* optimistic read state */ });
    }
    const next = new URLSearchParams(searchParams);
    next.set("announcement", String(id));
    setSearchParams(next);
  };

  const closeAnnouncement = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("announcement");
    setSearchParams(next, { replace: true });
  };

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      {selectedAnnouncement && (
        <AnnouncementMessageModal
          announcement={selectedAnnouncement}
          date={formatAnnouncementTimestamp(selectedAnnouncement.posted_date)}
          audience="Principal"
          postedBy={selectedAnnouncement.posted_by}
          onClose={closeAnnouncement}
        />
      )}
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
              important notices from the principal.
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
                {shown.map((ann) => {
                  const style = announcementTone(ann.is_priority);
                  return (
                  <article
                    key={ann.id}
                    id={`announcement-${ann.id}`}
                    className={`rounded-2xl p-6 shadow-sm border hover:shadow-md transition-shadow flex gap-4 ${style.border} ${
                      ann.id === selectedAnnouncementId
                        ? "bg-white ring-2 ring-primary/20"
                        : ann.is_read
                          ? "bg-white"
                          : "bg-slate-50"
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${style.bg} ${style.text}`}>
                      <span className="material-symbols-outlined text-xl" style={fillStyle}>{ann.is_priority ? "push_pin" : "campaign"}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                            {ann.is_priority ? "Priority · Principal" : "Principal"}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-widest ${ann.is_read ? "text-on-surface-variant" : "text-primary"}`}>
                            <span className={`h-2 w-2 rounded-full ${ann.is_read ? "bg-outline-variant" : "bg-primary"}`} />
                            {ann.is_read ? "Read" : "Unread"}
                          </span>
                        </div>
                        <span className="shrink-0 text-right text-[11px] text-on-surface-variant">{formatAnnouncementTimestamp(ann.posted_date)}</span>
                      </div>
                      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Subject</p>
                      <h4 className="mt-1 text-base font-extrabold text-on-surface leading-tight">{ann.title}</h4>
                      <button type="button" onClick={() => openAnnouncement(ann.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 -ml-2 text-sm font-bold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
                        View full message
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                      {ann.posted_by && <p className="mt-2 text-[11px] text-on-surface-variant">Posted by {ann.posted_by}</p>}
                    </div>
                  </article>
                  );
                })}
              </div>

              {hasMore && (
                <button
                  onClick={() => setVisible((v) => Math.max(v, shown.length) + PAGE_SIZE)}
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
