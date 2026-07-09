import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PrincipalLayout from "../../components/PrincipalLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { fetchAccount, updateAccount, changeAccountPassword, fetchSupportRequests, submitSupportRequest } from "../../api/settings.js";
import { loadSettings, saveSettings, applySettings } from "../../utils/accessibility.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

const TABS = [
  { key: "profile",       icon: "lock_person", label: "Profile Information & Security" },
  { key: "accessibility", icon: "settings",    label: "Accessibility" },
  { key: "contact",       icon: "mail",        label: "Contact Administrator" },
];

const CONTACT_REASONS = ["Technical Issue", "Account Access", "Data Correction", "Other"];

const inputClass = "w-full px-3.5 py-2.5 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary";
const labelClass = "block text-[11px] font-bold text-on-surface mb-1.5";

function PasswordField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label === "Current Password" ? "Enter current password" : label === "New Password" ? "Enter new password" : "Confirm new password"}
          className={`${inputClass} pr-10`}
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
          <span className="material-symbols-outlined text-base">{show ? "visibility" : "visibility_off"}</span>
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { logout } = useAuth();
  const navigate         = useNavigate();
  const schoolYearLabel  = useSchoolYear();

  const [activeTab, setActiveTab] = useState("profile");
  const [form,  setForm]  = useState({ first_name: "", last_name: "", email: "", contact_number: "" });
  const [saved, setSaved] = useState({ first_name: "", last_name: "", email: "", contact_number: "" });
  const [pwd,   setPwd]   = useState({ current: "", new: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [okMsg,   setOkMsg]   = useState("");
  const [support, setSupport] = useState([]);
  const [supportLoading, setSupportLoading] = useState(true);

  const loadSupport = () => {
    setSupportLoading(true);
    fetchSupportRequests()
      .then((res) => setSupport(res.data ?? []))
      .catch(() => setSupport([]))
      .finally(() => setSupportLoading(false));
  };

  const applyAccount = (d) => {
    const next = {
      first_name:     d.first_name ?? "",
      last_name:      d.last_name ?? "",
      email:          d.email ?? "",
      contact_number: d.contact_number ?? "",
      id_number:      d.id_number ?? "",
    };
    setForm(next);
    setSaved(next);
  };

  useEffect(() => {
    fetchAccount()
      .then((res) => applyAccount(res.data))
      .catch((err) => setError(err.response?.data?.message ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "contact") return;
    let cancelled = false;
    fetchSupportRequests()
      .then((res) => { if (!cancelled) setSupport(res.data ?? []); })
      .catch(() => { if (!cancelled) setSupport([]); })
      .finally(() => { if (!cancelled) setSupportLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setOkMsg(""); };
  const setP = (k, v) => { setPwd((p) => ({ ...p, [k]: v })); setOkMsg(""); };

  const handleDiscard = () => {
    setForm(saved);
    setPwd({ current: "", new: "", confirm: "" });
    setError(""); setOkMsg("");
  };

  const handleSave = async () => {
    setError(""); setOkMsg("");
    if (!form.first_name.trim() || !form.last_name.trim()) { setError("First and last name are required."); return; }

    const wantsPwd = pwd.current || pwd.new || pwd.confirm;
    if (wantsPwd) {
      if (!pwd.current)            { setError("Enter your current password."); return; }
      if (pwd.new.length < 8)      { setError("New password must be at least 8 characters."); return; }
      if (pwd.new !== pwd.confirm) { setError("New password and confirmation do not match."); return; }
    }

    setSaving(true);
    try {
      if (wantsPwd) await changeAccountPassword({ current_password: pwd.current, new_password: pwd.new });
      await updateAccount({
        first_name:     form.first_name.trim(),
        last_name:      form.last_name.trim(),
        email:          form.email.trim(),
        contact_number: form.contact_number.trim(),
      });
      const res = await fetchAccount();
      applyAccount(res.data);
      setPwd({ current: "", new: "", confirm: "" });
      setOkMsg("Your changes have been saved.");
    } catch (err) {
      setError(err.response?.data?.message ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <PrincipalLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 w-full">

        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-primary">Account Settings</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">Configure the academic environment and administrative controls.</p>
          </div>
          {activeTab === "profile" && (
            <div className="flex items-center gap-4 shrink-0">
              <button onClick={handleDiscard} disabled={saving} className="text-on-surface-variant font-bold text-sm hover:text-primary transition-colors disabled:opacity-50">
                Discard
              </button>
              <button onClick={handleSave} disabled={saving || loading} className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/10 hover:bg-primary/90 transition-colors disabled:opacity-60">
                <span className="material-symbols-outlined text-base">{saving ? "progress_activity" : "save"}</span>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}
        {okMsg && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-100 text-green-700 text-sm font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>{okMsg}
          </div>
        )}

        {/* Body grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[230px_1fr_260px] gap-6">

          {/* Left nav */}
          <aside className="space-y-1">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); setError(""); setOkMsg(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                    active ? "bg-white text-primary font-extrabold border-l-4 border-secondary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low border-l-4 border-transparent"
                  }`}
                >
                  <span className="material-symbols-outlined text-lg" style={active ? fillStyle : undefined}>{t.icon}</span>
                  <span className="text-sm font-bold leading-tight">{t.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Panel */}
          <section>
            <article className="bg-white rounded-2xl p-7 shadow-sm">
              {activeTab === "profile" && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="w-1.5 h-7 rounded-full bg-secondary" />
                    <h3 className="font-headline text-xl font-extrabold text-primary">Profile Information &amp; Security</h3>
                  </div>

                  {loading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-container-high rounded-xl animate-pulse" />)}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className={labelClass}>First Name</label>
                          <input className={inputClass} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
                        </div>
                        <div>
                          <label className={labelClass}>Last Name</label>
                          <input className={inputClass} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Email Address</label>
                        <input className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass}>Contact Number</label>
                        <input className={inputClass} value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} />
                      </div>

                      <div className="pt-6 mt-2 border-t border-outline-variant/15">
                        <h4 className="font-bold text-on-surface mb-4">Change Password</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <PasswordField label="Current Password" value={pwd.current} onChange={(v) => setP("current", v)} />
                          <PasswordField label="New Password"     value={pwd.new}     onChange={(v) => setP("new", v)} />
                          <PasswordField label="Confirm Password" value={pwd.confirm} onChange={(v) => setP("confirm", v)} />
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-2">Leave password fields blank to keep your current password. New password must be at least 8 characters.</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "accessibility" && <AccessibilityTab />}
              {activeTab === "contact"       && <ContactAdminTab account={saved} onSubmitted={loadSupport} />}
            </article>
          </section>

          {/* Preferences Overview */}
          <aside>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-on-surface tracking-wide mb-4">Preferences Overview</h3>

              <div className="space-y-3">
                <button className="w-full flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base" style={fillStyle}>dark_mode</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface">Appearance</p>
                    <p className="text-[11px] text-on-surface-variant">Light Theme</p>
                  </div>
                  <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
                </button>

                <button className="w-full flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-container-low transition-colors text-left">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 text-sm font-extrabold">Aあ</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface">Language</p>
                    <p className="text-[11px] text-on-surface-variant">English (US)</p>
                  </div>
                  <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-outline-variant/15">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-error/30 text-error hover:bg-error-container/40 transition-colors text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-base">logout</span>
                  Log Out
                </button>
                <p className="text-[11px] text-on-surface-variant text-center mt-2">Sign out of your account securely.</p>
              </div>
            </div>
          </aside>

        </div>

        {activeTab === "contact" && (
          <SupportRequestHistory items={support} loading={supportLoading} />
        )}
      </main>
    </PrincipalLayout>
  );
}

// ─── Accessibility (fully functional — applies app-wide + persists) ───────────
const TEXT_SIZES   = ["Small", "Medium", "Large"];
const COLOR_MODES  = ["Default", "Dark", "Color Blind"];
const FONT_STYLES  = ["Default", "Serif", "Monospace", "Dyslexic-Friendly"];

function A11yRow({ icon, iconBg, iconColor, glyphText, title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-outline-variant/10 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
          {glyphText
            ? <span className="text-sm font-extrabold">{glyphText}</span>
            : <span className="material-symbols-outlined text-base" style={fillStyle}>{icon}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface">{title}</p>
          <p className="text-[11px] text-on-surface-variant leading-snug">{desc}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function AccessibilityTab() {
  const [s, setS] = useState(loadSettings);

  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    applySettings(next); // live preview
    saveSettings(next);  // persist immediately
  };

  const selectClass = "px-3 py-2 text-sm border-2 border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary bg-white min-w-[130px]";

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <span className="w-1.5 h-7 rounded-full bg-secondary" />
        <h3 className="font-headline text-xl font-extrabold text-primary">Accessibility Features</h3>
      </div>
      <p className="text-sm text-on-surface-variant mb-4">Customize your experience to fit your needs.</p>

      <A11yRow icon="format_size" iconBg="bg-blue-50" iconColor="text-blue-500" title="Text Size" desc="Adjust the size of text across the application.">
        <div className="flex items-center gap-1 bg-surface-container-low rounded-xl p-1">
          {TEXT_SIZES.map((t) => (
            <button
              key={t}
              onClick={() => update({ textSize: t })}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors ${
                s.textSize === t ? "bg-on-surface text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </A11yRow>

      <A11yRow icon="contrast" iconBg="bg-teal-50" iconColor="text-teal-500" title="High Contrast Mode" desc="Increase contrast for better visibility.">
        <button
          onClick={() => update({ highContrast: !s.highContrast })}
          className={`relative w-11 h-6 rounded-full transition-colors ${s.highContrast ? "bg-primary" : "bg-outline-variant/50"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${s.highContrast ? "translate-x-5" : ""}`} />
        </button>
      </A11yRow>

      <A11yRow icon="palette" iconBg="bg-purple-50" iconColor="text-purple-500" title="Color Mode" desc="Choose a color mode that works best for you.">
        <select className={selectClass} value={s.colorMode} onChange={(e) => update({ colorMode: e.target.value })}>
          {COLOR_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </A11yRow>

      <A11yRow glyphText="Aa" iconBg="bg-orange-50" iconColor="text-orange-500" title="Font Style" desc="Choose a font style that improves readability.">
        <select className={selectClass} value={s.fontStyle} onChange={(e) => update({ fontStyle: e.target.value })}>
          {FONT_STYLES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </A11yRow>
    </>
  );
}

// ─── Contact Administrator (authenticated support request) ────────────────────
function ContactAdminTab({ account, onSubmitted }) {
  const [reason,  setReason]  = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [err,     setErr]     = useState("");
  const [ok,      setOk]      = useState("");

  const fullName = `${account.first_name ?? ""} ${account.last_name ?? ""}`.trim();
  const idNumber = account.id_number ? String(account.id_number) : "";

  const submit = async () => {
    setErr(""); setOk("");
    if (!reason || !message.trim()) { setErr("Please choose a reason and write a message."); return; }
    setSending(true);
    try {
      await submitSupportRequest({ reason, message: message.trim(), full_name: fullName });
      setReason(""); setMessage("");
      setOk("Your concern has been submitted to the administrator.");
      onSubmitted?.();
    } catch (e) {
      setErr(e.response?.data?.message ?? e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-1.5 h-7 rounded-full bg-secondary" />
        <h3 className="font-headline text-xl font-extrabold text-primary">Contact Administrator</h3>
      </div>
      <p className="text-sm text-on-surface-variant mb-5">Send a message to the system administrator for assistance.</p>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>{err}
        </div>
      )}
      {ok && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-100 text-green-700 text-sm font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-base">check_circle</span>{ok}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className={labelClass}>Full Name</label>
          <input className={`${inputClass} bg-surface-container-low text-on-surface-variant`} value={fullName} disabled />
        </div>
        <div>
          <label className={labelClass}>ID Number</label>
          <input className={`${inputClass} bg-surface-container-low text-on-surface-variant`} value={idNumber} disabled />
        </div>
        <div>
          <label className={labelClass}>Reason for Contact</label>
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select a reason</option>
            {CONTACT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Message</label>
          <textarea rows={5} className={`${inputClass} resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your message here..." />
        </div>
        <div className="flex justify-end">
          <button onClick={submit} disabled={sending} className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {sending ? <span className="material-symbols-outlined text-base animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-base">send</span>}
            Submit Concern
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Support Request History ──────────────────────────────────────────────────
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";

const statusPill = (status, hasReply) => {
  if (status === "Resolved")     return { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" };
  if (hasReply || status === "In Progress") return { label: "Replied", cls: "bg-blue-100 text-blue-700" };
  return { label: "Pending", cls: "bg-amber-100 text-amber-700" };
};

function SupportRequestHistory({ items, loading }) {
  return (
    <div className="bg-white rounded-2xl p-7 shadow-sm mt-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-1.5 h-7 rounded-full bg-secondary" />
        <h3 className="font-headline text-xl font-extrabold text-primary">Support Request History</h3>
      </div>
      <p className="text-sm text-on-surface-variant mb-5">View the status and replies of your submitted concerns.</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-surface-container-high rounded-xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">You haven't submitted any support requests yet.</p>
      ) : (
        <div className="divide-y divide-outline-variant/10">
          {items.map((r) => {
            const pill = statusPill(r.status, !!r.response);
            return (
              <div key={r.sr_id} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1.6fr] gap-4 py-5">
                <div>
                  <p className="text-sm font-extrabold text-on-surface tracking-wide">{r.ticketId}</p>
                  <p className="text-sm font-bold text-on-surface mt-0.5">{r.category}</p>
                  <p className="text-[11px] text-on-surface-variant mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-sm">calendar_month</span>{fmtDate(r.sent_date)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-sm">schedule</span>{fmtTime(r.sent_date)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Status</p>
                  <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${pill.cls}`}>{pill.label}</span>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-on-surface-variant mb-1">Administrator Reply</p>
                  {r.response ? (
                    <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/15 px-3 py-2">
                      <p className="text-sm text-on-surface">{r.response}</p>
                      {r.response_date && (
                        <p className="text-[11px] text-on-surface-variant mt-1.5 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-sm">reply</span>Replied on {fmtDate(r.response_date)}</span>
                          <span>·</span><span>{fmtTime(r.response_date)}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm italic text-amber-700">Awaiting administrator response.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
