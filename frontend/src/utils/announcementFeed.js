// Keep priority posts pinned; within each group, show the newest post first.
export const compareAnnouncements = (a, b) =>
  Number(Boolean(b.is_priority)) - Number(Boolean(a.is_priority))
  || (new Date(b.posted_date).getTime() || 0) - (new Date(a.posted_date).getTime() || 0)
  || Number(b.ann_id ?? b.id ?? 0) - Number(a.ann_id ?? a.id ?? 0);

export const announcementTone = (isPriority) => isPriority
  ? { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" }
  : { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" };

export const formatAnnouncementTimestamp = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};
