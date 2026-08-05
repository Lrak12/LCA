// Reusable confirmation dialog for consequential actions (delete, cancel, reset,
// activate, deactivate…). Presentational + controlled: render it when you have a
// pending action and wire onConfirm / onCancel. Styled to match the app's modals.
//
// Props:
//   open         - boolean; render nothing when false
//   title        - heading text
//   message      - body text (string or node)
//   detail       - optional secondary line under the icon ("This cannot be undone.")
//   confirmLabel - confirm button text (default "Confirm")
//   cancelLabel  - cancel button text (default "Cancel")
//   tone         - "danger" (red, default) | "primary" (dark) | "success" (green)
//   icon         - material symbol name (defaults per tone)
//   busy         - in-flight flag; disables buttons + shows a spinner
//   onConfirm    - called when the confirm button is clicked
//   onCancel     - called when the cancel button / backdrop is clicked
const fillStyle = { fontVariationSettings: '"FILL" 1' };

const TONES = {
  danger:  { chip: "bg-red-100 text-red-500",       btn: "bg-red-500 text-white hover:opacity-90",     icon: "warning" },
  primary: { chip: "bg-primary/10 text-primary",    btn: "bg-[#0d1b2e] text-white hover:opacity-90",   icon: "help" },
  success: { chip: "bg-green-100 text-green-600",    btn: "bg-green-600 text-white hover:bg-green-700", icon: "check_circle" },
};

export default function ConfirmModal({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  icon,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const t = TONES[tone] ?? TONES.danger;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-4 sm:p-8">
        <div className="flex items-center gap-4 mb-5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${t.chip}`}>
            <span className="material-symbols-outlined text-xl" style={fillStyle}>{icon ?? t.icon}</span>
          </div>
          <div>
            <h2 className="font-headline text-xl font-extrabold text-primary">{title}</h2>
            {detail && <p className="text-sm text-on-surface-variant mt-0.5">{detail}</p>}
          </div>
        </div>

        {message && <div className="text-sm text-on-surface-variant mb-6">{message}</div>}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-6 py-3 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 sm:px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-opacity disabled:opacity-60 ${t.btn}`}
          >
            {busy
              ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Working…</>
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
