import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import AnnouncementMessageModal from "../../components/AnnouncementMessageModal.jsx";
import { compareAnnouncements, formatAnnouncementTimestamp } from "../../utils/announcementFeed.js";
import { fetchAnnouncements } from "../../api/announcements.js";
import { markNotificationRead } from "../../api/notifications.js";
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
  All:     { bg: "bg-blue-100",   text: "text-blue-700"   },
  Teacher: { bg: "bg-amber-100",  text: "text-amber-700"  },
  Student: { bg: "bg-purple-100", text: "text-purple-700" },
  Parent:  { bg: "bg-green-100",  text: "text-green-700"  },
};

const PAGE_SIZE = 5;

export default function Announcements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAnnouncementId = Number(searchParams.get("announcement"));
  const schoolYearLabel       = useSchoolYear();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
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

  const sorted = useMemo(() => [...items].sort(compareAnnouncements), [items]);

  const selectedIndex = sorted.findIndex((announcement) => announcement.ann_id === selectedAnnouncementId);
  const selectedAnnouncement = selectedIndex >= 0 ? sorted[selectedIndex] : null;
  const shown   = sorted.slice(0, Math.max(visible, selectedIndex + 1));
  const hasMore = shown.length < sorted.length;

  const openAnnouncement = (id) => {
    const announcement = items.find((item) => item.ann_id === id);
    if (announcement && !announcement.is_read && announcement.notification_id) {
      setItems((current) => current.map((item) => item.ann_id === id ? { ...item, is_read: true } : item));
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
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      {selectedAnnouncement && (
        <AnnouncementMessageModal
          announcement={selectedAnnouncement}
          date={formatAnnouncementTimestamp(selectedAnnouncement.posted_date)}
          audience="Principal"
          postedBy={selectedAnnouncement.principal ? `${selectedAnnouncement.principal.first_name ?? ""} ${selectedAnnouncement.principal.last_name ?? ""}`.trim() : ""}
          onClose={closeAnnouncement}
        />
      )}
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
                    id={`announcement-${ann.ann_id}`}
                    className={`rounded-2xl p-6 shadow-sm border hover:shadow-md transition-shadow flex gap-4 ${
                      ann.ann_id === selectedAnnouncementId
                        ? "border-primary bg-white ring-2 ring-primary/20"
                        : ann.is_read
                          ? "border-outline-variant/20 bg-white"
                          : "border-primary/40 bg-primary/[0.035]"
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.text}`}>
                      <span className="material-symbols-outlined text-xl" style={fillStyle}>{ann.is_priority ? "push_pin" : "campaign"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-extrabold tracking-widest uppercase px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
                            {ann.is_priority ? "Priority · Principal" : "Principal"}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-widest ${ann.is_read ? "text-on-surface-variant" : "text-primary"}`}>
                            <span className={`h-2 w-2 rounded-full ${ann.is_read ? "bg-outline-variant" : "bg-primary"}`} />
                            {ann.is_read ? "Read" : "Unread"}
                          </span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant shrink-0 text-right">{formatAnnouncementTimestamp(ann.posted_date)}</span>
                      </div>
                      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Subject</p>
                      <h4 className="mt-1 text-base font-extrabold text-on-surface leading-tight">{ann.title}</h4>
                      <button type="button" onClick={() => openAnnouncement(ann.ann_id)} className="mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 -ml-2 text-sm font-bold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
                        View full message
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
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
                  onClick={() => setVisible((v) => Math.max(v, shown.length) + PAGE_SIZE)}
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
