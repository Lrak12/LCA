import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StudentLayout from "../../components/StudentLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  loadSettings,
  saveSettings,
  applySettings,
  DEFAULT_SETTINGS,
} from "../../utils/accessibility.js";
import {
  fetchStudentAccount,
  updateStudentAccount,
  changeStudentAccountPassword,
  fetchStudentSupportRequests,
  submitStudentSupportRequest,
} from "../../api/student.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Toggle switch ────────────────────────────────────────────────────────────
const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    aria-pressed={value}
    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-green-500" : "bg-slate-300"}`}
  >
    <span
      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
        value ? "left-[22px]" : "left-[2px]"
      }`}
    />
  </button>
);

// ─── Accessibility feature row ────────────────────────────────────────────────
const AccessRow = ({ icon, iconBg, title, desc, children }) => (
  <div className="flex items-center gap-4 py-5 border-b border-outline-variant/10 last:border-0">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      <span className="material-symbols-outlined text-white text-xl" style={fillStyle}>{icon}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-extrabold text-on-surface">{title}</p>
      <p className="text-[11px] text-on-surface-variant mt-0.5">{desc}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const selectCls =
  "appearance-none text-sm font-bold text-on-surface bg-white border border-outline-variant/30 rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer min-w-[130px]";
const inputCls =
  "w-full px-3 py-2.5 text-sm text-on-surface border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm";
const labelCls =
  "text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1.5 block";

// ─── Password field with show/hide ────────────────────────────────────────────
const PasswordField = ({ label, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputCls} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
          tabIndex={-1}
        >
          <span className="material-symbols-outlined text-lg">{show ? "visibility_off" : "visibility"}</span>
        </button>
      </div>
    </div>
  );
};

// ─── Left sub-nav ─────────────────────────────────────────────────────────────
const NAV = [
  { key: "profile",       icon: "person",   title: "Profile",       sub: "Information & Security" },
  { key: "accessibility", icon: "settings", title: "Accessibility", sub: ""                       },
  { key: "contact",       icon: "mail",     title: "Contact",       sub: "Administrator"          },
];

const SubNav = ({ active, onSelect }) => (
  <div className="w-56 shrink-0">
    <div className="space-y-1">
      {NAV.map((n) => {
        const on = active === n.key;
        return (
          <button
            key={n.key}
            onClick={() => onSelect(n.key)}
            className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border-l-[3px] transition-colors ${
              on
                ? "border-secondary bg-secondary/5 text-secondary"
                : "border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-xl" style={on ? fillStyle : undefined}>{n.icon}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-bold leading-tight ${on ? "text-secondary" : "text-on-surface"}`}>{n.title}</span>
              {n.sub && <span className="block text-[11px] text-on-surface-variant leading-tight">{n.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Preferences overview (right) ─────────────────────────────────────────────
const PrefRow = ({ iconBg, icon, title, sub, subColor }) => (
  <div className="flex items-center gap-3 py-3">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      <span className="material-symbols-outlined text-white text-[18px]" style={fillStyle}>{icon}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-on-surface leading-tight">{title}</p>
      <p className={`text-[11px] ${subColor ?? "text-on-surface-variant"}`}>{sub}</p>
    </div>
    <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
  </div>
);

const PrefSidebar = ({ onLogout }) => (
  <div className="w-64 shrink-0 space-y-4">
    <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5">
      <h3 className="text-sm font-extrabold text-on-surface mb-2">Preferences Overview</h3>
      <div className="divide-y divide-outline-variant/10">
        <PrefRow iconBg="bg-indigo-700" icon="dark_mode" title="Appearance" sub="Light Theme" subColor="text-primary" />
        <PrefRow iconBg="bg-amber-500"  icon="language"  title="Language"   sub="English (US)" />
      </div>
    </div>

    <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5">
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-red-500 border border-red-300 rounded-xl px-4 py-2.5 hover:bg-red-50 transition-colors"
      >
        <span className="material-symbols-outlined text-base" style={fillStyle}>logout</span>
        Log Out
      </button>
      <p className="text-[11px] text-on-surface-variant text-center mt-2">Sign out of your account securely.</p>
    </div>
  </div>
);

// Must match the user_support_request.category_check DB constraint.
const CONTACT_REASONS = ["Technical Issue", "Password Reset", "Other"];

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

// Normalize the DB status to three display states.
const statusStyle = (status) => {
  const s = String(status ?? "").toLowerCase();
  if (s === "resolved" || s === "closed")
    return { label: "Resolved", pill: "bg-green-100 text-green-700", box: "bg-green-50 border-green-100 text-green-800" };
  if (s === "in progress" || s === "replied" || s === "answered")
    return { label: "Replied", pill: "bg-blue-100 text-blue-700", box: "bg-blue-50 border-blue-100 text-blue-800" };
  return { label: "Pending", pill: "bg-amber-100 text-amber-700", box: "bg-amber-50 border-amber-100 text-amber-700" };
};

// ─── Support request history ──────────────────────────────────────────────────
const SupportHistory = ({ requests }) => (
  <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
    <div className="flex items-center gap-3 mb-1">
      <span className="w-1 h-5 rounded-full bg-secondary" />
      <h3 className="text-base font-extrabold text-on-surface">Support Request History</h3>
    </div>
    <p className="text-[12px] text-on-surface-variant mb-5 ml-4">View the status and replies of your submitted concerns.</p>

    {requests.length === 0 ? (
      <p className="py-8 text-center text-sm text-on-surface-variant">You haven't submitted any concerns yet.</p>
    ) : (
      <div className="divide-y divide-outline-variant/10">
        {requests.map((r) => {
          const st = statusStyle(r.status);
          return (
            <div key={r.sr_id} className="grid grid-cols-1 md:grid-cols-[1.1fr_0.7fr_1.6fr] gap-4 py-5">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-on-surface">{r.ticketId}</p>
                <p className="text-sm font-bold text-on-surface mt-0.5">{r.category}</p>
                <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-1.5">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">calendar_today</span>{fmtDate(r.sent_date)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">schedule</span>{fmtTime(r.sent_date)}</span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1.5">Status</p>
                <span className={`inline-block text-[11px] font-extrabold px-3 py-1 rounded-full ${st.pill}`}>{st.label}</span>
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1.5">Administrator Reply</p>
                {r.response ? (
                  <div className={`rounded-xl border px-4 py-3 ${st.box}`}>
                    <p className="text-[13px] leading-snug whitespace-pre-line">{r.response}</p>
                    {r.response_date && (
                      <div className="flex items-center gap-2 text-[11px] opacity-70 mt-2">
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">calendar_today</span>Replied on {fmtDate(r.response_date)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">schedule</span>{fmtTime(r.response_date)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <p className="text-[13px] italic text-amber-700">Awaiting administrator response.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const schoolYearLabel = useSchoolYear();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("profile");

  // Profile state (loaded from backend)
  const [loaded,    setLoaded]    = useState(null);   // last-saved snapshot for Discard
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [contact,   setContact]   = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Accessibility state — loaded from localStorage
  const [textSize,       setTextSize]       = useState(DEFAULT_SETTINGS.textSize);
  const [highContrast,   setHighContrast]   = useState(DEFAULT_SETTINGS.highContrast);
  const [colorMode,      setColorMode]      = useState(DEFAULT_SETTINGS.colorMode);
  const [worksheetScale, setWorksheetScale] = useState(DEFAULT_SETTINGS.worksheetScale);
  const [fontStyle,      setFontStyle]      = useState(DEFAULT_SETTINGS.fontStyle);

  // Contact Administrator
  const [contactReason,  setContactReason]  = useState("");
  const [contactMsg,     setContactMsg]     = useState("");
  const [sending,        setSending]        = useState(false);
  const [requests,       setRequests]       = useState([]);

  // Shared
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);   // { type: "success"|"error", text }

  const flash = (type, text) => { setToast({ type, text }); setTimeout(() => setToast(null), 3500); };

  const loadRequests = () =>
    fetchStudentSupportRequests().then((res) => setRequests(res.data ?? [])).catch(() => {});

  // Load profile + requests + accessibility on mount
  useEffect(() => {
    fetchStudentAccount()
      .then((res) => {
        const a = res.data ?? {};
        setLoaded(a);
        setFirstName(a.first_name ?? "");
        setLastName(a.last_name ?? "");
        setEmail(a.email ?? "");
        setContact(a.contact_number ?? "");
      })
      .catch(() => {});

    loadRequests();

    const s = loadSettings();
    setTextSize(s.textSize);
    setHighContrast(s.highContrast);
    setColorMode(s.colorMode);
    setWorksheetScale(s.worksheetScale);
    setFontStyle(s.fontStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed name from the auth context immediately (before/if the account fetch is slow)
  useEffect(() => {
    if (!user || loaded) return;
    setFirstName((v) => v || user.first_name || "");
    setLastName((v) => v || user.last_name || "");
  }, [user, loaded]);

  // Apply + persist accessibility settings whenever any value changes
  useEffect(() => {
    const settings = { textSize, highContrast, colorMode, worksheetScale, fontStyle };
    applySettings(settings);
    saveSettings(settings);
  }, [textSize, highContrast, colorMode, worksheetScale, fontStyle]);

  const handleDiscard = () => {
    if (loaded) {
      setFirstName(loaded.first_name ?? "");
      setLastName(loaded.last_name ?? "");
      setEmail(loaded.email ?? "");
      setContact(loaded.contact_number ?? "");
    }
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
  };

  const handleSave = async () => {
    const wantsPwChange = currentPw || newPw || confirmPw;
    if (wantsPwChange) {
      if (!currentPw)          return flash("error", "Enter your current password to change it.");
      if (newPw.length < 8)    return flash("error", "New password must be at least 8 characters.");
      if (newPw !== confirmPw) return flash("error", "New password and confirmation do not match.");
    }

    setSaving(true);
    try {
      const res = await updateStudentAccount({
        first_name: firstName, last_name: lastName, email, contact_number: contact,
      });
      setLoaded(res.data ?? loaded);

      if (wantsPwChange) {
        await changeStudentAccountPassword({ current_password: currentPw, new_password: newPw });
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      }
      flash("success", "Changes saved successfully.");
    } catch (err) {
      flash("error", err.response?.data?.message ?? err.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendContact = async () => {
    if (!contactReason)     return flash("error", "Please select a reason for contact.");
    if (!contactMsg.trim()) return flash("error", "Please write a message to the administrator.");
    setSending(true);
    try {
      await submitStudentSupportRequest({
        reason: contactReason,
        message: contactMsg.trim(),
        full_name: `${firstName} ${lastName}`.trim(),
      });
      setContactMsg("");
      setContactReason("");
      flash("success", "Your concern was submitted to the administrator.");
      loadRequests();
    } catch (err) {
      flash("error", err.response?.data?.message ?? err.message ?? "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <StudentLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-8 max-w-full mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Account Settings</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Manage your profile, preferences, and security settings.</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <button onClick={handleDiscard} className="text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors">
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors rounded-xl px-5 py-2.5 shadow-sm disabled:opacity-50"
            >
              {saving
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <span className="material-symbols-outlined text-base" style={fillStyle}>save</span>}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── Three-column layout ─────────────────────────────────────── */}
        <div className="flex gap-6 items-start">

          <SubNav active={activeTab} onSelect={setActiveTab} />

          {/* ── CENTER: section content ──────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* ════ PROFILE INFORMATION & SECURITY ════ */}
            {activeTab === "profile" && (
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <span className="w-1 h-5 rounded-full bg-secondary" />
                  <h3 className="text-base font-extrabold text-on-surface">Profile Information &amp; Security</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>First Name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Last Name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Email Address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Contact Number</label>
                    <input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <h4 className="text-base font-extrabold text-on-surface mt-8 mb-4">Change Password</h4>
                <div className="grid grid-cols-3 gap-4">
                  <PasswordField label="Current Password" value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" />
                  <PasswordField label="New Password"     value={newPw}     onChange={setNewPw}     placeholder="Enter new password" />
                  <PasswordField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />
                </div>
                <p className="text-[11px] text-on-surface-variant mt-2">Leave the password fields blank to keep your current password.</p>
              </div>
            )}

            {/* ════ ACCESSIBILITY ════ */}
            {activeTab === "accessibility" && (
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <h3 className="text-base font-extrabold text-on-surface">Accessibility Features</h3>
                <p className="text-[12px] text-on-surface-variant mt-0.5 mb-2">Customize your experience to fit your needs. Changes apply immediately and are saved automatically.</p>

                <AccessRow icon="format_size" iconBg="bg-indigo-500" title="Text Size" desc="Adjust the size of text across the application.">
                  <div className="flex rounded-xl overflow-hidden border border-outline-variant/30">
                    {["Small", "Medium", "Large"].map((sz) => (
                      <button key={sz} onClick={() => setTextSize(sz)}
                        className={`px-4 py-1.5 text-sm font-bold transition-colors ${textSize === sz ? "bg-on-surface text-white" : "bg-white text-on-surface-variant hover:bg-surface-container-low"}`}>
                        {sz}
                      </button>
                    ))}
                  </div>
                </AccessRow>

                <AccessRow icon="wb_sunny" iconBg="bg-teal-500" title="High Contrast Mode" desc="Increase contrast for better visibility.">
                  <Toggle value={highContrast} onChange={setHighContrast} />
                </AccessRow>

                <AccessRow icon="palette" iconBg="bg-purple-500" title="Color Mode" desc="Choose a color mode that works best for you.">
                  <div className="relative">
                    <select value={colorMode} onChange={(e) => setColorMode(e.target.value)} className={selectCls}>
                      {["Default", "Dark", "High Contrast", "Color Blind"].map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 18 }}>expand_more</span>
                  </div>
                </AccessRow>

                <AccessRow icon="text_fields" iconBg="bg-green-500" title="Font Style" desc="Choose a font style that improves readability.">
                  <div className="relative">
                    <select value={fontStyle} onChange={(e) => setFontStyle(e.target.value)} className={selectCls}>
                      {["Default", "Serif", "Monospace", "Dyslexic-Friendly"].map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 18 }}>expand_more</span>
                  </div>
                </AccessRow>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setTextSize(DEFAULT_SETTINGS.textSize);
                      setHighContrast(DEFAULT_SETTINGS.highContrast);
                      setColorMode(DEFAULT_SETTINGS.colorMode);
                      setWorksheetScale(DEFAULT_SETTINGS.worksheetScale);
                      setFontStyle(DEFAULT_SETTINGS.fontStyle);
                    }}
                    className="text-xs font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded-xl px-4 py-2 hover:bg-surface-container-low transition-colors"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}

            {/* ════ CONTACT ADMINISTRATOR ════ */}
            {activeTab === "contact" && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-1 h-5 rounded-full bg-secondary" />
                    <h3 className="text-base font-extrabold text-on-surface">Contact Administrator</h3>
                  </div>
                  <p className="text-[12px] text-on-surface-variant mb-5 ml-4">
                    Send a message to the system administrator for assistance.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className={labelCls}>Full Name</label>
                      <input type="text" readOnly
                        value={`${firstName} ${lastName}`.trim() || `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim()}
                        className={`${inputCls} bg-surface-container-low text-on-surface-variant cursor-not-allowed`} />
                    </div>
                    <div>
                      <label className={labelCls}>ID Number</label>
                      <input type="text" readOnly
                        value={loaded?.id_number ?? user?.id_number ?? ""}
                        className={`${inputCls} bg-surface-container-low text-on-surface-variant cursor-not-allowed`} />
                    </div>
                    <div>
                      <label className={labelCls}>Reason for Contact</label>
                      <div className="relative">
                        <select value={contactReason} onChange={(e) => setContactReason(e.target.value)}
                          className={`${selectCls} w-full ${contactReason ? "" : "text-on-surface-variant"}`}>
                          <option value="" disabled>Select a reason</option>
                          {CONTACT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" style={{ fontSize: 18 }}>expand_more</span>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Message</label>
                      <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} rows={5}
                        placeholder="Type your message here…" className={`${inputCls} resize-none`} />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={handleSendContact}
                        disabled={sending}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors rounded-xl px-5 py-2.5 shadow-sm disabled:opacity-50"
                      >
                        {sending
                          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <span className="material-symbols-outlined text-base" style={fillStyle}>send</span>}
                        {sending ? "Submitting…" : "Submit Concern"}
                      </button>
                    </div>
                  </div>
                </div>

                <SupportHistory requests={requests} />
              </div>
            )}
          </div>

          {/* ── RIGHT: Preferences ───────────────────────────────────── */}
          <PrefSidebar onLogout={handleLogout} />
        </div>

        {/* ── Toast ────────────────────────────────────────────────────── */}
        {toast && (
          <div className={`fixed bottom-6 right-6 flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-lg z-50 ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
            <span className="material-symbols-outlined text-base" style={fillStyle}>{toast.type === "success" ? "check_circle" : "error"}</span>
            {toast.text}
          </div>
        )}

      </main>
    </StudentLayout>
  );
}
