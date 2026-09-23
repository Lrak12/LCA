import { announcementTone, formatAnnouncementTimestamp } from "../utils/announcementFeed.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const getDaysRemaining = (postedDate) => {
  if (!postedDate) return null;
  const posted = new Date(postedDate);
  if (Number.isNaN(posted.getTime())) return null;
  const expires = posted.getTime() + 7 * 24 * 60 * 60 * 1000;
  return Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24));
};

export default function AnnouncementFeedCard({ announcement, announcementId, selected = false, onOpen }) {
  const category = announcementTone(announcement.is_priority);
  const eyebrow = announcement.is_priority
    ? "Priority Announcement"
    : "Announcement";
  const daysLeft = getDaysRemaining(announcement.posted_date);

  return (
    <article
      id={`announcement-${announcementId}`}
      className={`rounded-xl border bg-white p-7 shadow-sm transition-shadow hover:shadow-md ${category.border} ${selected ? "ring-2 ring-primary/20" : ""}`}
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${category.bg} ${category.text}`}>
          <span className="material-symbols-outlined" style={fillStyle}>
            {announcement.is_priority ? "push_pin" : "campaign"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-extrabold uppercase tracking-widest ${category.text}`}>
            {eyebrow}
          </p>
          <p className="mt-3 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
            Subject
          </p>
          <h3 className="mt-1 font-headline text-xl font-extrabold text-primary">
            {announcement.title}
          </h3>

          <div className="mt-5 flex flex-col gap-4 border-t border-surface-container pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">calendar_month</span>
                Posted {formatAnnouncementTimestamp(announcement.posted_date)}
              </span>
              {daysLeft !== null && daysLeft > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">timer</span>
                  Auto-deletes in {daysLeft}d
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onOpen}
              className="ml-auto inline-flex items-center gap-1 text-xs font-extrabold text-secondary hover:underline"
            >
              View full details
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
