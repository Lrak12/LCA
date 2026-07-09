import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "../../components/AdminLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchPasswordResets, processPasswordReset } from "../../api/admin.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };
const PAGE_SIZE = 8;

const ROLE_LABEL = {
  administrator: "Administrator", principal: "Principal",
  teacher: "Supervisor", student: "Student", parent: "Parent",
};

const STATUS_BADGE = {
  Pending:     "bg-amber-100 text-amber-700",
  Resolved:    "bg-green-100 text-green-700",
  Open:        "bg-amber-100 text-amber-700",
  "In Progress": "bg-purple-100 text-purple-700",
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-lg ${className}`} />
);

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const isResolved = (s) => String(s ?? "").toLowerCase() === "resolved";

const InfoRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-outline-variant/10 last:border-0">
    <span className="text-[13px] text-on-surface-variant">{label}</span>
    <span className="text-[13px] font-semibold text-on-surface text-right">{children}</span>
  </div>
);

export default function UserPasswordResets() {
  const schoolYearLabel = useSchoolYear();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage]     = useState(1);

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [banner, setBanner]   = useState("");
  const [tempResult, setTempResult] = useState(null); // { tempPassword, email }

  const [selected, setSelected] = useState(null);
  const [action, setAction]     = useState("temp");
  const [note, setNote]         = useState("");
  const [processing, setProcessing] = useState(false);

  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchPasswordResets({ search, status, page, pageSize: PAGE_SIZE })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message ?? "Failed to load password reset requests."))
      .finally(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const requests = data?.requests ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const statuses = data?.statuses ?? [];
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const process = async (req, act, noteText) => {
    // No email service yet: "Send Password Reset Link" copies a reset link to the
    // clipboard so the admin can share it manually. The link pre-fills the user's ID.
    if (act === "link") {
      const link = `${window.location.origin}/reset-password?id=${req.school_id ?? ""}`;
      try {
        await navigator.clipboard.writeText(link);
        setBanner(`Reset link copied to clipboard for ${req.name}.`);
      } catch {
        setError(`Couldn't copy automatically — copy this link manually: ${link}`);
      }
      // Best-effort: mark the ticket handled (non-fatal until table grants are applied)
      try { await processPasswordReset(req.sr_id, { action: "link", note: noteText }); } catch { /* ignore */ }
      setSelected(null);
      setNote("");
      load();
      return;
    }

    setProcessing(true);
    setError("");
    try {
      const res = await processPasswordReset(req.sr_id, { action: act, note: noteText });
      if (act === "temp" && res.data?.tempPassword) {
        setTempResult({ tempPassword: res.data.tempPassword, email: res.data.email, name: req.name });
      } else {
        setBanner(`${req.requestId} resolved.`);
      }
      setSelected(null);
      setNote("");
      load();
    } catch (err) {
      setError(err.message ?? "Failed to process request.");
    } finally {
      setProcessing(false);
    }
  };

  const selectCls = "appearance-none bg-white border border-outline-variant/30 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer";

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full space-y-6">
      {banner && (
        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{banner}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>{error}
        </div>
      )}

      {/* Generated temp password */}
      {tempResult && (
        <div className="px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-blue-800 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base" style={fillStyle}>key</span>
                Temporary password generated for {tempResult.name}
              </p>
              <p className="text-[12px] text-blue-700 mt-1">
                Share this with the user securely{tempResult.email ? ` (registered email: ${tempResult.email})` : ""}. It is shown only once.
              </p>
              <code className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-sm font-bold tracking-wide text-on-surface">
                {tempResult.tempPassword}
              </code>
            </div>
            <button onClick={() => setTempResult(null)} className="p-1 rounded-full hover:bg-blue-100 text-blue-700">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      )}

      {/* List card */}
      <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm">
        <div className="p-5 border-b border-outline-variant/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Password Reset Requests</h3>
            <p className="text-sm text-on-surface-variant">View and manage security and password reset requests.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
                <option value="all">All Status</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-outline text-base pointer-events-none">expand_more</span>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-lg">search</span>
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name, email, or user ID…"
                className="w-56 pl-9 pr-3 py-2 bg-surface-container-high border-none rounded-lg text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/20 text-[11px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3 font-bold">Request ID</th>
                <th className="px-4 py-3 font-bold">User</th>
                <th className="px-4 py-3 font-bold">User ID</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Requested At</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-outline-variant/10"><td colSpan={7} className="px-4 py-4"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-on-surface-variant">No password reset requests found.</td></tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.sr_id} className={`border-b border-outline-variant/10 transition-colors ${selected?.sr_id === r.sr_id ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 text-sm font-bold text-on-surface whitespace-nowrap">{r.requestId}</td>
                    <td className="px-4 py-3 text-sm text-on-surface">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{r.school_id ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-on-surface">{ROLE_LABEL[r.role] ?? r.role ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{fmtDate(r.requested_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setSelected(r); setAction("temp"); setNote(""); }}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary" title="View details">
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        <button onClick={() => process(r, "resolve", "")} disabled={isResolved(r.status) || processing}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white disabled:bg-surface-container disabled:text-outline disabled:cursor-not-allowed">
                          Resolve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/20">
          <p className="text-sm text-on-surface-variant">
            {total === 0 ? "No entries" : `Showing ${rangeStart} to ${rangeEnd} of ${total} entries`}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <span className="px-3 text-sm font-medium text-on-surface">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Request Details */}
      <div>
        <h3 className="font-headline text-lg font-extrabold text-on-surface mb-1">Request Details</h3>
        <p className="text-sm text-on-surface-variant mb-4">Select a request from the list to view details and take action.</p>

        {!selected ? (
          <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm py-12 text-center text-sm text-on-surface-variant">
            No request selected.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Request Information */}
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-on-surface-variant" style={fillStyle}>info</span>
                <h4 className="font-headline text-base font-extrabold text-on-surface">Request Information</h4>
              </div>
              <InfoRow label="Request ID">{selected.requestId}</InfoRow>
              <InfoRow label="Name">{selected.name}</InfoRow>
              <InfoRow label="User ID">{selected.school_id ?? "—"}</InfoRow>
              <InfoRow label="Role">{ROLE_LABEL[selected.role] ?? selected.role ?? "—"}</InfoRow>
              <InfoRow label="Requested At">{fmtDate(selected.requested_at)}</InfoRow>
              <InfoRow label="Status">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[selected.status] ?? "bg-slate-100 text-slate-600"}`}>{selected.status}</span>
              </InfoRow>
              <InfoRow label="Request Source">{selected.requestSource}</InfoRow>
              <InfoRow label="Registered Email">{selected.email || "—"}</InfoRow>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-on-surface-variant" style={fillStyle}>bolt</span>
                <h4 className="font-headline text-base font-extrabold text-on-surface">Actions</h4>
              </div>
              <p className="text-sm text-on-surface-variant mb-4">Choose an action to process this request.</p>

              <div className="space-y-2 mb-4">
                {[
                  { key: "temp", title: "Send Temporary Password", sub: "A temporary password will be set and shown to you / sent to the user's registered email." },
                  { key: "link", title: "Copy Password Reset Link", sub: "The reset link is copied to your clipboard to share with the user." },
                ].map((opt) => (
                  <label key={opt.key} className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer ${action === opt.key ? "border-primary bg-primary/5" : "border-outline-variant/40"}`}>
                    <input type="radio" name="pwaction" checked={action === opt.key} onChange={() => setAction(opt.key)} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-bold text-on-surface">{opt.title}</span>
                      <span className="block text-[11px] text-on-surface-variant">{opt.sub}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-semibold text-on-surface mb-1.5">Administrator Notes <span className="font-normal text-outline">(optional)</span></label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a note (optional)…"
                  className="w-full bg-white border border-outline-variant/40 rounded-lg px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none" />
              </div>

              <div className="flex justify-end gap-3 mt-auto pt-2 border-t border-outline-variant/20">
                <button onClick={() => setSelected(null)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-on-surface-variant hover:bg-surface-container">Cancel</button>
                <button onClick={() => process(selected, action, note)} disabled={processing}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold bg-primary text-white shadow-sm hover:shadow-lg disabled:opacity-60">
                  {processing ? "Sending…" : "Confirm & Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>
    </AdminLayout>
  );
}
