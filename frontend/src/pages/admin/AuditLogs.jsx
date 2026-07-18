// Audit Logs (sysadmin): reads system_audit_log with filters + pagination.
// Backend chain (frontend api/admin.js fetchAuditLogs -> routes/admin.routes.js):
//   GET /admin/audit-logs -> controllers/audit.controller.js > getAuditLogs (~line 5)
//                         -> services/audit.service.js > listAuditLogs (~line 57)
import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout.jsx";
import { fetchAuditLogs } from "../../api/admin.js";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// action string (from system_audit_log.action) -> pill colour for the Action column
const ACTION_BADGE = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-600",
  LOGIN:  "bg-pink-100 text-pink-600",
  LOGOUT: "bg-slate-100 text-slate-600",
};

// role value -> display label (teacher shows as "Supervisor" in this app)
const ROLE_LABEL = {
  administrator: "Administrator",
  principal:     "Principal",
  teacher:       "Supervisor",
  student:       "Student",
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-lg ${className}`} />
);

// timestamp for the Date & Time column, or an em dash when missing/invalid
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// Compact, windowed page list with ellipsis: 1 … 4 5 [6] 7 8 … 26
const buildPageList = (current, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, current, current - 1, current + 1]); // always show first/last + window around current
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");            // gap between kept pages -> ellipsis
    out.push(p);
    prev = p;
  }
  return out;
};

const EMPTY_FILTERS = { search: "", user_id: "all", action: "all", module: "all", from: "", to: "" };

export default function AuditLogs() {
  const schoolYearLabel = useSchoolYear();

  // Draft (in the form) vs applied (committed via Filter button) filters.
  const [draft, setDraft]     = useState(EMPTY_FILTERS); // what's typed/selected in the filter form
  const [applied, setApplied] = useState(EMPTY_FILTERS); // what's actually sent to the API
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(5);           // rows per page (user-selectable)

  const [data, setData]       = useState(null);          // API response { logs, total, totalPages, filters }
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const setD = (k) => (e) => setDraft((f) => ({ ...f, [k]: e.target.value })); // curried onChange per draft field

  // fetch a page of audit entries with the applied filters; re-runs on filter/page/size change
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAuditLogs({ ...applied, page, pageSize })       // GET /admin/audit-logs
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message ?? "Failed to load audit logs."))
      .finally(() => setLoading(false));
  }, [applied, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const onFilter = () => { setApplied(draft); setPage(1); }; // commit the draft filters and jump to page 1

  const logs        = data?.logs ?? [];                  // this page's entries
  const total       = data?.total ?? 0;
  const totalPages  = data?.totalPages ?? 1;
  const opts        = data?.filters ?? { users: [], actions: [], modules: [] }; // dropdown options built from the data
  const rangeStart  = total === 0 ? 0 : (page - 1) * pageSize + 1; // "Showing X to Y" numbers
  const rangeEnd    = Math.min(page * pageSize, total);

  const selectCls = "appearance-none bg-white border border-outline-variant/30 rounded-lg pl-3.5 pr-9 py-2.5 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer w-full";
  const Chevron = () => (
    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1 text-outline text-lg pointer-events-none">expand_more</span>
  );

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Audit Logs</h2>
            <p className="text-on-surface-variant mt-1">Track and review user activities and system changes.</p>
          </div>
          {/* Export Logs button -> no handler yet (inert; "coming soon") */}
          <button
            className="flex items-center gap-2 px-5 py-3 bg-white border border-outline-variant/30 text-on-surface font-bold rounded-xl shadow-sm hover:bg-surface-container-lowest transition-all shrink-0"
            title="Export coming soon"
          >
            <span className="material-symbols-outlined text-lg">file_download</span>
            Export Logs
          </button>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Filters (all edit the draft; nothing hits the API until "Filter" is clicked) */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* free-text search (Enter also applies) */}
            <div>
              <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Search</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1 text-base text-on-surface-variant pointer-events-none">search</span>
                {/* input -> setD("search") updates draft; Enter -> onFilter() commits it */}
                <input
                  value={draft.search}
                  onChange={setD("search")}
                  onKeyDown={(e) => e.key === "Enter" && onFilter()}
                  placeholder="Search user, action, or module…"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-outline-variant/30 rounded-lg text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>
            </div>
            {/* user dropdown (options come from the API's distinct users) */}
            <div>
              <label className="block text-[13px] font-semibold text-on-surface mb-1.5">User</label>
              <div className="relative">
                {/* -> setD("user_id") updates draft; options from `opts.users` */}
                <select value={draft.user_id} onChange={setD("user_id")} className={selectCls}>
                  <option value="all">All Users</option>
                  {opts.users.map((u) => <option key={u.user_id} value={String(u.user_id)}>{u.name}</option>)}
                </select>
                <Chevron />
              </div>
            </div>
            {/* module dropdown (distinct entity_affected values) */}
            <div>
              <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Module</label>
              <div className="relative">
                {/* -> setD("module") updates draft; options from `opts.modules` */}
                <select value={draft.module} onChange={setD("module")} className={selectCls}>
                  <option value="all">All Modules</option>
                  {opts.modules.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Chevron />
              </div>
            </div>
            {/* action dropdown (distinct action values) */}
            <div>
              <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Action</label>
              <div className="relative">
                {/* -> setD("action") updates draft; options from `opts.actions` */}
                <select value={draft.action} onChange={setD("action")} className={selectCls}>
                  <option value="all">All Actions</option>
                  {opts.actions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <Chevron />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-end gap-4 mt-4">
            {/* from/to date range */}
            <div>
              <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Date Range</label>
              {/* date inputs -> setD("from") / setD("to") update draft */}
              <div className="flex items-center gap-2">
                <input type="date" value={draft.from} onChange={setD("from")} className="bg-white border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                <span className="text-on-surface-variant text-sm">–</span>
                <input type="date" value={draft.to} onChange={setD("to")} className="bg-white border border-outline-variant/30 rounded-lg px-3 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none" />
              </div>
            </div>
            {/* Filter button -> onFilter() copies draft into `applied` -> load() refetches */}
            <button
              onClick={onFilter}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold rounded-lg shadow-sm hover:shadow-lg transition-all"
            >
              <span className="material-symbols-outlined text-lg">filter_list</span>
              Filter
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/20">
            <p className="text-sm font-bold text-on-surface">
              {total === 0 ? "No entries" : `Showing ${rangeStart} to ${rangeEnd} of ${total} entries`}
            </p>
          </div>

          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/20 text-[11px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-6 py-3.5 font-bold">Date &amp; Time</th>
                <th className="px-6 py-3.5 font-bold">User</th>
                <th className="px-6 py-3.5 font-bold">Action</th>
                <th className="px-6 py-3.5 font-bold">Module</th>
                <th className="px-6 py-3.5 font-bold">Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // skeleton rows while the page loads
                Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10">
                    <td colSpan={5} className="px-6 py-4"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-on-surface-variant">No audit entries match your filters.</td></tr>
              ) : (
                // one row per audit entry
                logs.map((l) => (
                  <tr key={l.sal_id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/50 transition-colors align-top">
                    <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap">{fmtDateTime(l.timestamp)}</td>
                    <td className="px-6 py-4">
                      {/* who did it: name + role label */}
                      <p className="text-sm font-bold text-on-surface leading-tight">{l.userName}</p>
                      <p className="text-[11px] text-on-surface-variant">{ROLE_LABEL[l.userRole] ?? l.userRole ?? "—"}</p>
                    </td>
                    <td className="px-6 py-4">
                      {/* action pill (colour keyed off the action string) */}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${ACTION_BADGE[l.action] ?? "bg-slate-100 text-slate-600"}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface">{l.module ?? "—"}</td>       {/* what was affected */}
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{l.description ?? "—"}</td> {/* human-readable details */}
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          {/* Footer / pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-outline-variant/20">
            {/* rows-per-page selector (resets to page 1 on change) */}
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span>Show</span>
              <div className="relative">
                {/* -> setPageSize + setPage(1); page-size change re-runs load() */}
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
                  className="appearance-none bg-white border border-outline-variant/30 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer"
                >
                  {[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-outline text-base pointer-events-none">expand_more</span>
              </div>
              <span>entries</span>
            </div>

            {/* pager -> setPage(prev/exact/next); page change re-runs load() via effect */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {buildPageList(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-on-surface-variant text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold ${
                      p === page ? "bg-primary text-white" : "border border-outline-variant/30 text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </AdminLayout>
  );
}
