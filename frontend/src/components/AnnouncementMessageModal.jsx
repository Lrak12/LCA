import { useEffect, useId, useRef } from "react";

const renderContent = (content = "") => String(content).split(/\*\*(.*?)\*\*/g).map((part, index) =>
  index % 2 === 1
    ? <strong key={index} className="font-bold text-on-surface">{part}</strong>
    : <span key={index}>{part}</span>
);

export default function AnnouncementMessageModal({ announcement, date, audience, postedBy, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!announcement) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Subject</p>
            <h2 id={titleId} className="mt-1 font-headline text-xl font-extrabold text-primary break-words">{announcement.title}</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              {[date, audience, postedBy ? `Posted by ${postedBy}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close announcement" className="shrink-0 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Message</p>
          <div className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words">
            {renderContent(announcement.content)}
          </div>
        </div>
      </div>
    </div>
  );
}
