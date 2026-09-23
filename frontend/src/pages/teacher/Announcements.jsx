import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import AnnouncementMessageModal from "../../components/AnnouncementMessageModal.jsx";
import AnnouncementDateFilter from "../../components/AnnouncementDateFilter.jsx";
import AnnouncementFeedCard from "../../components/AnnouncementFeedCard.jsx";
import { compareAnnouncements, formatAnnouncementTimestamp, isAnnouncementWithinDateRange } from "../../utils/announcementFeed.js";
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

const PAGE_SIZE = 5;

export default function Announcements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAnnouncementId = Number(searchParams.get("announcement"));
  const schoolYearLabel       = useSchoolYear();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate]     = useState("");

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
  const filtered = useMemo(
    () => sorted.filter((announcement) => isAnnouncementWithinDateRange(announcement, fromDate, toDate)),
    [sorted, fromDate, toDate],
  );

  const selectedIndex = sorted.findIndex((announcement) => announcement.ann_id === selectedAnnouncementId);
  const selectedAnnouncement = selectedIndex >= 0 ? sorted[selectedIndex] : null;
  const shown   = filtered.slice(0, visible);
  const hasMore = shown.length < filtered.length;

  const changeFromDate = (value) => { setFromDate(value); setVisible(PAGE_SIZE); };
  const changeToDate = (value) => { setToDate(value); setVisible(PAGE_SIZE); };

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

        <AnnouncementDateFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={changeFromDate}
          onToDateChange={changeToDate}
        />

        {/* List */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 sm:p-10 text-center shadow-sm border border-outline-variant/20">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 block" style={fillStyle}>notifications_off</span>
            <p className="text-on-surface-variant text-sm font-bold">
              {items.length > 0 ? "No announcements match the selected dates." : "No announcements from the principal yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {shown.map((ann) => {
                return (
                  <AnnouncementFeedCard
                    key={ann.ann_id}
                    announcement={ann}
                    announcementId={ann.ann_id}
                    selected={ann.ann_id === selectedAnnouncementId}
                    onOpen={() => openAnnouncement(ann.ann_id)}
                  />
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
