import { useState, useEffect, useRef } from "react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../api/notifications.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Shared notification bell + dropdown used across all dashboard layouts (principal + admin).
// Backend chain (frontend api/notifications.js -> routes/notification.routes.js):
//   list:     GET   /notifications          -> controllers/notification.controller.js > getMine (~line 5)     -> services/notification.service.js > getMyNotifications (~line 5)
//   mark 1:   PATCH /notifications/:id/read  -> controllers/notification.controller.js > markRead (~line 10)   -> services/notification.service.js > markRead (~line 18)
//   mark all: PATCH /notifications/read-all  -> controllers/notification.controller.js > markAllRead (~line 15) -> services/notification.service.js > markAllRead (~line 23)
export default function NotificationBell() {
  const [open, setOpen]       = useState(false);   // dropdown open?
  const [items, setItems]     = useState([]);       // notification rows
  const [unread, setUnread]   = useState(0);        // unread badge count
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  // load the current user's notifications on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchNotifications();
        if (cancelled) return;
        setItems(res.data?.notifications ?? []);
        setUnread(res.data?.unreadCount ?? 0);
      } catch {
        // notifications unavailable (e.g. table grants not applied) — show empty
        if (!cancelled) { setItems([]); setUnread(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleItemClick = async (n) => {
    if (n.is_read) return;
    setItems((prev) => prev.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try { await markNotificationRead(n.notification_id); } catch { /* optimistic */ }
  };

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    try { await markAllNotificationsRead(); } catch { /* optimistic */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="p-2 text-slate-600 hover:bg-surface-container rounded-full transition-colors relative"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[26rem] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-outline-variant/20 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 sticky top-0 bg-white">
            <p className="font-bold text-primary text-sm">Notifications</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs font-bold text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-12 bg-surface-container-high rounded-lg" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl block mb-2" style={fillStyle}>notifications_off</span>
              <p className="text-sm">No notifications yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {items.map((n) => (
                <li key={n.notification_id}>
                  <button
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex gap-3 ${n.is_read ? "" : "bg-primary/5"}`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface leading-snug">{n.title}</p>
                      <p className="text-xs text-on-surface-variant leading-snug mt-0.5">{n.message_content}</p>
                      <p className="text-[10px] text-on-surface-variant mt-1">{formatDate(n.created_date)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
