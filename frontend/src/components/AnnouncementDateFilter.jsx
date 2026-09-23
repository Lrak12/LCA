// Temporarily disabled. Change this to true when the announcement date filter
// is ready to be shown again for students, supervisors, and principals.
const ANNOUNCEMENT_DATE_FILTER_ENABLED = false;

export default function AnnouncementDateFilter({ fromDate, toDate, onFromDateChange, onToDateChange }) {
  if (!ANNOUNCEMENT_DATE_FILTER_ENABLED) return null;

  const hasFilter = Boolean(fromDate || toDate);

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-outline-variant/20 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
      <div className="flex items-center gap-2 sm:mr-2 sm:self-center">
        <span className="material-symbols-outlined text-secondary">date_range</span>
        <span className="text-sm font-extrabold text-on-surface">Filter by date</span>
      </div>
      <label className="flex-1 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
        From
        <input
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(event) => onFromDateChange(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-outline-variant/40 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-on-surface"
        />
      </label>
      <label className="flex-1 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
        To
        <input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(event) => onToDateChange(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-outline-variant/40 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-on-surface"
        />
      </label>
      <button
        type="button"
        disabled={!hasFilter}
        onClick={() => {
          onFromDateChange("");
          onToDateChange("");
        }}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant/40 px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-base">filter_alt_off</span>
        Clear
      </button>
    </div>
  );
}
