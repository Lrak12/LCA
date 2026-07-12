// Announcements (principal): post announcements to chosen audiences (immediate or
// scheduled), and browse published/scheduled feeds; auto-expire after 7 days.
// Backend chain (frontend api/announcements.js -> routes/announcement.routes.js):
//   list:   GET    /announcements     -> controllers/announcement.controller.js > getAll (~line 5)  -> services/announcement.service.js > getAnnouncements (~line 25)
//   create: POST   /announcements     -> controllers/announcement.controller.js > create (~line 15) -> services/announcement.service.js > createAnnouncement (~line 37)
//   delete: DELETE /announcements/:id -> controllers/announcement.controller.js > remove (~line 25) -> services/announcement.service.js > deleteAnnouncement (~line 61)
import { useEffect, useMemo, useState } from "react";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { fetchAnnouncements, createAnnouncement, deleteAnnouncement } from "../../api/announcements.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-xl ${className}`} />
);

const categoryStyles = {
  Parents: { icon: "push_pin",             bg: "bg-secondary-fixed",        text: "text-secondary", border: "border-secondary" },
  Parent:  { icon: "push_pin",             bg: "bg-secondary-fixed",        text: "text-secondary", border: "border-secondary" },
  Student: { icon: "event",                bg: "bg-primary-fixed",          text: "text-primary",   border: "border-primary"   },
  Teacher: { icon: "group_add",            bg: "bg-primary-fixed",          text: "text-primary",   border: "border-primary"   },
  Admin:   { icon: "admin_panel_settings", bg: "bg-surface-container-high", text: "text-primary",   border: "border-primary"   },
  All:     { icon: "campaign",             bg: "bg-tertiary-fixed",         text: "text-secondary", border: "border-secondary" },
};

const formatDate = (value) => {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

const formatTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

// truncate long content to a ~145-char card preview
const getPreview = (content = "") =>
  content.length > 145 ? `${content.slice(0, 145).trim()}...` : content;

// map the stored audience_role to a friendly label
const normalizeAudience = (audience = "All") =>
  audience === "Parent" ? "Parents" : audience === "All" ? "Entire Community" : audience;

// ─── Days remaining until auto-delete ────────────────────────────────────────
// announcements expire 7 days after posting; returns days left (can be negative)
const getDaysRemaining = (postedDate) => {
  if (!postedDate) return null;
  const posted  = new Date(postedDate);
  const expires = new Date(posted.getTime() + 7 * 24 * 60 * 60 * 1000);
  const diff    = Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
};

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ announcement, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-red-500 text-xl" style={fillStyle}>delete</span>
          </div>
          <div>
            <h2 className="font-headline text-xl font-extrabold text-primary">Delete Announcement</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xl px-4 py-3 mb-6">
          <p className="text-sm font-bold text-on-surface line-clamp-2">{announcement.title}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">
            Posted {formatDate(announcement.posted_date)} • {normalizeAudience(announcement.audience_role)}
          </p>
        </div>

        <p className="text-sm text-on-surface-variant mb-6">
          Are you sure you want to delete this announcement? It will be removed immediately for all users.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-6 py-3 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          {/* Delete -> onConfirm = page's handleDelete() (deleteAnnouncement, then reload) */}
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-8 py-3 rounded-xl bg-red-500 text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {deleting
              ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Deleting...</>
              : <><span className="material-symbols-outlined text-base">delete</span> Delete</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Announcement Modal ────────────────────────────────────────────────
// Audience checkboxes → backend audience_role. "Supervisors" = the Teacher role.
const AUDIENCE_CHOICES = [
  { key: "All",         label: "All",         icon: "public",            role: "All"     },
  { key: "Students",    label: "Students",    icon: "school",            role: "Student" },
  { key: "Supervisors", label: "Supervisors", icon: "supervisor_account", role: "Teacher" },
];

function CreateAnnouncementModal({ onClose, onSuccess }) {
  const [audiences, setAudiences] = useState({ All: false, Students: false, Supervisors: false }); // checked audiences
  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [publish,   setPublish]   = useState("immediate"); // immediate | schedule
  const [date,      setDate]      = useState("");
  const [time,      setTime]      = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const toggleAudience = (key) => setAudiences((a) => ({ ...a, [key]: !a[key] })); // check/uncheck one audience

  // Resolve checked audiences → distinct backend roles. "All" covers everyone.
  const selectedRoles = () => {
    const checked = AUDIENCE_CHOICES.filter((c) => audiences[c.key]);
    if (checked.some((c) => c.key === "All")) return ["All"];
    return [...new Set(checked.map((c) => c.role))];
  };

  // validate, resolve the posted date (now or scheduled), then create one row per audience
  const handleSubmit = async () => {
    setError("");
    const roles = selectedRoles();
    if (roles.length === 0) { setError("Select at least one target audience."); return; }
    if (!title.trim())      { setError("Announcement title is required."); return; }
    if (!content.trim())    { setError("Announcement message is required."); return; }
    if (publish === "schedule" && !date) { setError("Pick a date to schedule this announcement."); return; }

    // scheduled -> the chosen date/time; immediate -> now
    const posted_date = publish === "schedule"
      ? new Date(`${date}T${time || "00:00"}`).toISOString()
      : new Date().toISOString();

    setSaving(true);
    try {
      // One announcement per selected audience.
      await Promise.all(roles.map((role) => createAnnouncement({
        title:         title.trim(),
        content:       content.trim(),
        audience_role: role,
        posted_date,
        is_active:     true,
      })));
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3.5 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary";
  const sectionLabel = "text-[11px] font-bold text-on-surface";
  const req = <span className="text-error">*</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-outline-variant/20 flex items-start justify-between shrink-0">
          <h2 className="font-headline text-xl font-extrabold text-on-surface">Create New Announcement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6">
          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[190px_1fr_240px] gap-7">

            {/* Target audience */}
            <div>
              <p className={`${sectionLabel} mb-2`}>Target Audience {req}</p>
              <div className="border-2 border-outline-variant/30 rounded-xl divide-y divide-outline-variant/15 overflow-hidden">
                {AUDIENCE_CHOICES.map((c) => (
                  <label key={c.key} className="flex items-center gap-2.5 px-3 py-3 cursor-pointer hover:bg-surface-container-lowest transition-colors">
                    <input
                      type="checkbox"
                      checked={audiences[c.key]}
                      onChange={() => toggleAudience(c.key)}
                      className="w-4 h-4 accent-primary rounded shrink-0"
                    />
                    <span className="material-symbols-outlined text-base text-on-surface-variant">{c.icon}</span>
                    <span className="text-sm font-bold text-on-surface">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Title + message */}
            <div className="space-y-5">
              <div>
                <label className={sectionLabel}>Title {req}</label>
                <input className={`${inputClass} mt-2`} placeholder="Enter announcement title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className={sectionLabel}>Announcement Message {req}</label>
                <textarea
                  rows={7}
                  className={`${inputClass} mt-2 resize-none`}
                  placeholder="Enter announcement message here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <p className="text-[11px] text-on-surface-variant mt-1.5">You can describe the details of your announcement.</p>
              </div>
            </div>

            {/* Publication options */}
            <div>
              <p className={`${sectionLabel} mb-2`}>Publication Option {req}</p>
              <div className="space-y-3">
                {[
                  { key: "immediate", label: "Publish Immediately", desc: "The announcement will be visible to the selected audience right away." },
                  { key: "schedule",  label: "Schedule Publication", desc: "Choose a future date and time to publish this announcement." },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPublish(opt.key)}
                    className="flex items-start gap-2.5 text-left w-full"
                  >
                    <span
                      className={`material-symbols-outlined text-xl shrink-0 ${publish === opt.key ? "text-primary" : "text-on-surface-variant"}`}
                      style={publish === opt.key ? fillStyle : undefined}
                    >
                      {publish === opt.key ? "radio_button_checked" : "radio_button_unchecked"}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-on-surface">{opt.label}</span>
                      <span className="block text-[11px] text-on-surface-variant mt-0.5 leading-snug">{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              {publish === "schedule" && (
                <div className="mt-5">
                  <p className={`${sectionLabel} mb-2`}>Schedule Date and Time {req}</p>
                  <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                  <input type="time" className={`${inputClass} mt-2`} value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-outline-variant/20 flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={saving} className="px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60">
            Cancel
          </button>
          {/* Publish/Schedule -> handleSubmit() (createAnnouncement per audience, then onSuccess) */}
          <button onClick={handleSubmit} disabled={saving} className="px-7 py-2.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving
              ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span> Saving…</>
              : <><span className="material-symbols-outlined text-base">{publish === "schedule" ? "schedule" : "send"}</span> {publish === "schedule" ? "Schedule Announcement" : "Publish Announcement"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Announcements() {
  const { user }        = useAuth();
  const schoolYearLabel = useSchoolYear();
  const isAdmin         = user?.role === "principal"; // only the principal can post/delete

  const [announcements, setAnnouncements] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [currentTime,   setCurrentTime]   = useState(0);   // "now" snapshot for published-vs-scheduled split
  const [showModal,     setShowModal]     = useState(false); // Create modal open?
  const [deleteTarget,  setDeleteTarget]  = useState(null);  // announcement pending delete
  const [deleting,      setDeleting]      = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAnnouncements();
      setAnnouncements(res.data);
      setCurrentTime(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // delete the pending announcement, then refresh
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteTarget.ann_id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // active + posted date already reached -> shown in the main feed
  const published = useMemo(
    () => announcements.filter((ann) => ann.is_active !== false && (!ann.posted_date || new Date(ann.posted_date).getTime() <= currentTime)),
    [announcements, currentTime]
  );

  // active + posted date still in the future -> shown in the Scheduled sidebar
  const scheduled = useMemo(
    () => announcements.filter((ann) => ann.is_active !== false && ann.posted_date && new Date(ann.posted_date).getTime() > currentTime),
    [announcements, currentTime]
  );

  // inactive rows -> drafts
  const drafts = useMemo(
    () => announcements.filter((ann) => ann.is_active === false),
    [announcements]
  );

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-10 max-w-full mx-auto w-full">

        {/* Modals */}
        {showModal && (
          <CreateAnnouncementModal
            onClose={() => setShowModal(false)}
            onSuccess={load}
          />
        )}
        {deleteTarget && (
          <ConfirmDeleteModal
            announcement={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </div>
        )}

        <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-primary">Announcements</h2>
            <p className="text-on-surface-variant mt-1">"Communication is the bridge between wisdom and community."</p>
          </div>
          {/* Create New Announcement -> setShowModal(true) opens <CreateAnnouncementModal> (principal only) */}
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg">edit_note</span>
              Create New Announcement
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">
          <section className="space-y-6">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <article key={index} className="bg-white rounded-xl p-7 shadow-sm">
                  <Skeleton className="h-5 w-44 mb-3" />
                  <Skeleton className="h-7 w-80 mb-6" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-7" />
                  <Skeleton className="h-4 w-44" />
                </article>
              ))
            ) : published.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center text-on-surface-variant">
                No published announcements yet.
              </div>
            ) : (
              published.map((ann, index) => {
                const audience    = ann.audience_role || "All";
                const category    = categoryStyles[audience] || categoryStyles.All;
                const eyebrow     = index === 0 ? "Important Announcement" : audience === "All" ? "School Calendar" : `${normalizeAudience(audience)} Update`;
                const daysLeft    = getDaysRemaining(ann.posted_date);
                const expiringSoon = daysLeft !== null && daysLeft <= 2 && daysLeft > 0;
                const expiredToday = daysLeft !== null && daysLeft <= 0;

                return (
                  <article key={ann.ann_id} className="bg-white rounded-xl p-7 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg ${category.bg} ${category.text} flex items-center justify-center shrink-0`}>
                        <span className="material-symbols-outlined" style={fillStyle}>{category.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <p className={`text-[10px] uppercase tracking-widest font-extrabold ${category.text}`}>
                            {eyebrow}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Expiry badge */}
                            {expiredToday && (
                              <span className="text-[9px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                Expiring today
                              </span>
                            )}
                            {expiringSoon && !expiredToday && (
                              <span className="text-[9px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {daysLeft}d left
                              </span>
                            )}
                            {/* Delete button — admin only; -> setDeleteTarget(ann) opens <ConfirmDeleteModal> */}
                            {isAdmin && (
                              <button
                                onClick={() => setDeleteTarget(ann)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-variant hover:text-red-500 transition-colors"
                                title="Delete announcement"
                              >
                                <span className="material-symbols-outlined text-base">delete</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <h3 className="font-headline text-xl font-extrabold text-primary mt-1">
                          {ann.title}
                        </h3>
                        <p className="text-on-surface-variant mt-5 leading-relaxed">
                          {getPreview(ann.content)}
                        </p>

                        <div className="mt-7 pt-4 border-t border-surface-container flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                            <span className="inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">calendar_month</span>
                              Posted {formatDate(ann.posted_date)}
                            </span>
                            {daysLeft !== null && daysLeft > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">timer</span>
                                Auto-deletes in {daysLeft}d
                              </span>
                            )}
                            <span className="bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full text-[10px] uppercase font-extrabold">
                              {normalizeAudience(audience)}
                            </span>
                          </div>
                          {/* <button className="text-secondary font-extrabold text-xs hover:underline inline-flex items-center gap-1"> 
                            View full details
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                          </button> */}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <aside className="space-y-8">
            <section className="bg-surface-container-low rounded-2xl p-6 shadow-sm border border-outline-variant/20">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline text-lg font-extrabold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">schedule</span>
                  Scheduled
                </h3>
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                  {scheduled.length}
                </span>
              </div>
              <div className="space-y-4">
                {loading ? (
                  <><Skeleton className="h-24 w-full" /><Skeleton className="h-20 w-full" /></>
                ) : scheduled.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No scheduled announcements.</p>
                ) : (
                  scheduled.slice(0, 2).map((ann, index) => {
                    const color = index === 0 ? "border-secondary" : "border-primary";
                    return (
                      <div key={ann.ann_id} className={`bg-white rounded-lg p-4 border-l-4 ${color}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-extrabold text-primary uppercase">Release: {formatTime(ann.posted_date)}</p>
                            <h4 className="text-sm font-extrabold text-primary mt-1">{ann.title}</h4>
                            <p className="text-[11px] text-on-surface-variant mt-1">Target: {normalizeAudience(ann.audience_role)}</p>
                          </div>
                          {isAdmin && (
                            <button onClick={() => setDeleteTarget(ann)} className="p-1 rounded hover:bg-red-50 text-on-surface-variant hover:text-red-500 transition-colors shrink-0">
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="bg-surface-container-low rounded-2xl p-6 shadow-sm border border-outline-variant/20">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline text-lg font-extrabold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">drafts</span>
                  Drafts
                </h3>
                <span className="w-6 h-6 rounded-full bg-outline text-white flex items-center justify-center text-[10px] font-bold">
                  {drafts.length}
                </span>
              </div>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : drafts.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No saved drafts.</p>
              ) : (
                drafts.slice(0, 2).map((ann) => (
                  <div key={ann.ann_id} className="bg-white rounded-lg border border-dashed border-outline-variant p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-extrabold text-primary">{ann.title}</h4>
                        <p className="text-[11px] text-on-surface-variant mt-2">Last edited {formatDate(ann.updated_at || ann.posted_date)}</p>
                        <button className="mt-5 text-primary font-extrabold text-[10px] uppercase hover:underline">
                          Continue Editing
                        </button>
                      </div>
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(ann)} className="p-1 rounded hover:bg-red-50 text-on-surface-variant hover:text-red-500 transition-colors shrink-0">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      </main>
    </PrincipalLayout>
  );
}
