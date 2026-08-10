import { useState, useEffect } from "react";
import TeacherLayout from "../../components/TeacherLayout.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import {
  loadSettings,
  saveSettings,
  applySettings,
  DEFAULT_SETTINGS,
} from "../../utils/accessibility.js";
import { isPhMobile, PH_MOBILE_HINT } from "../../utils/phone.js";
import EmailChangeModal from "../../components/EmailChangeModal.jsx";
import {
  fetchTeacherAccount,
  updateTeacherAccount,
  changeTeacherPassword,
  submitTeacherSupportRequest,
  fetchTeacherSupportRequests,
  requestTeacherEmailCode,
  verifyTeacherEmailCode,
} from "../../api/teacher.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// ─── Accessibility feature row ────────────────────────────────────────────────
const AccessRow = ({ icon, iconBg, title, desc, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-5 border-b border-outline-variant/10 last:border-0">
    <div className="flex items-center gap-4 flex-1 min-w-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <span className="material-symbols-outlined text-white text-xl" style={fillStyle}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-on-surface">{title}</p>
        <p className="text-[11px] text-on-surface-variant mt-0.5">{desc}</p>
      </div>
    </div>
    {/* control drops below the label on mobile, indented under the text */}
    <div className="shrink-0 pl-14 sm:pl-0">{children}</div>
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
          className="absolute right-3 top-1/2 -translate-y-1 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          tabIndex={-1}
        >
          <span className="material-symbols-outlined text-lg">{show ? "visibility" : "visibility_off"}</span>
        </button>
      </div>
    </div>
  );
};

// No left nav anymore — Accessibility is folded into its own card below Profile
// (High Contrast Mode, Font Style, and Worksheet Scale were removed entirely; High
// Contrast is still reachable via the Color Mode dropdown) and Contact Administrator
// stays hidden (panel + handlers remain below, just unreachable), so `activeTab`
// never changes from "profile" — same layout as the student/principal Settings pages.

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
  </div>
);

const PrefSidebar = ({ onLogout }) => (
  <div className="w-full lg:w-64 shrink-0 space-y-4">
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

const CONTACT_REASONS = ["Account Issue", "Technical Support", "Data Correction", "Password Reset", "Report Concern", "Other"];

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

// Normalize the DB status to the mockup's three display states.
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
              {/* Ticket + subject + sent date */}
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-on-surface">{r.ticketId}</p>
                <p className="text-sm font-bold text-on-surface mt-0.5">{r.category}</p>
                <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-1.5">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">calendar_today</span>{fmtDate(r.sent_date)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">schedule</span>{fmtTime(r.sent_date)}</span>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant mb-1.5">Status</p>
                <span className={`inline-block text-[11px] font-extrabold px-3 py-1 rounded-full ${st.pill}`}>{st.label}</span>
              </div>

              {/* Admin reply */}
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
export default function AccountSettings() {
  const schoolYearLabel = useSchoolYear();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab] = useState("profile"); // always "profile" — no left nav; Contact stays hidden (see top-of-file note)

  // Profile state (loaded from backend)
  const [loaded,    setLoaded]    = useState(null);   // last-saved snapshot for Discard
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [contact,   setContact]   = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false); // verified email-change flow

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
    fetchTeacherSupportRequests().then((res) => setRequests(res.data ?? [])).catch(() => {});

  // Load profile + requests + accessibility on mount
  useEffect(() => {
    fetchTeacherAccount()
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
    setColorMode(s.colorMode);
    // High Contrast Mode, Font Style, and Worksheet Scale were removed as controls here —
    // force them to default so a value saved before the removal can't stay stuck with no
    // way to change it back (high contrast is still reachable via the Color Mode dropdown).
    setHighContrast(DEFAULT_SETTINGS.highContrast);
    setFontStyle(DEFAULT_SETTINGS.fontStyle);
    setWorksheetScale(DEFAULT_SETTINGS.worksheetScale);
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
    if (!firstName.trim()) return flash("error", "First name is required.");
    if (!lastName.trim())  return flash("error", "Last name is required.");
    if (!email.trim())     return flash("error", "Email address is required.");
    if (contact.trim() && !isPhMobile(contact)) return flash("error", PH_MOBILE_HINT);
    // Password change is optional; validate only if any field is filled.
    const wantsPwChange = currentPw || newPw || confirmPw;
    if (wantsPwChange) {
      if (!currentPw)            return flash("error", "Enter your current password to change it.");
      if (newPw.length < 8)      return flash("error", "New password must be at least 8 characters.");
      if (newPw !== confirmPw)   return flash("error", "New password and confirmation do not match.");
    }

    setSaving(true);
    try {
      const res = await updateTeacherAccount({
        first_name: firstName, last_name: lastName, email, contact_number: contact,
      });
      setLoaded(res.data ?? loaded);

      if (wantsPwChange) {
        await changeTeacherPassword({ current_password: currentPw, new_password: newPw });
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
    if (!contactReason)      return flash("error", "Please select a reason for contact.");
    if (!contactMsg.trim())  return flash("error", "Please write a message to the administrator.");
    setSending(true);
    try {
      await submitTeacherSupportRequest({
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
    <TeacherLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">Account Settings</h2>
            <p className="text-on-surface-variant mt-1 text-sm">Configure the academic environment and administrative controls.</p>
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

        {/* ── Two-column layout (stacks on < lg): content + preferences sidebar ── */}
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

          {/* ── CENTER: section content ──────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* ════ PROFILE INFORMATION & SECURITY ════ */}
            {activeTab === "profile" && (
              <>
                <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="w-1 h-5 rounded-full bg-secondary" />
                    <h3 className="text-base font-extrabold text-on-surface">Profile Information &amp; Security</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>First Name</label>
                      <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Last Name</label>
                      <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Email Address</label>
                      <div className="flex items-center gap-2">
                        <input type="email" value={email} disabled className={`${inputCls} bg-surface-container-low text-on-surface-variant cursor-not-allowed`} />
                        <button type="button" onClick={() => setShowEmailModal(true)}
                          className="shrink-0 px-4 py-2.5 rounded-lg border border-outline-variant/40 text-sm font-bold text-primary hover:bg-surface-container-low transition-colors whitespace-nowrap">
                          Change
                        </button>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1">Changing your email sends a verification code to the new address.</p>
                    </div>
                    {showEmailModal && (
                      <EmailChangeModal
                        currentEmail={email}
                        requestCode={(newEmail) => requestTeacherEmailCode(newEmail)}
                        verifyCode={async (code, newEmail) => { const res = await verifyTeacherEmailCode({ newEmail, code }); return res?.data?.email; }}
                        onChanged={(newEmail) => { setEmail(newEmail); setLoaded((p) => (p ? { ...p, email: newEmail } : p)); }}
                        onClose={() => setShowEmailModal(false)}
                      />
                    )}
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Contact Number</label>
                      <input type="tel" value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  <h4 className="text-base font-extrabold text-on-surface mt-8 mb-4">Change Password</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <PasswordField label="Current Password" value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" />
                    <PasswordField label="New Password"     value={newPw}     onChange={setNewPw}     placeholder="Enter new password" />
                    <PasswordField label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-2">Leave the password fields blank to keep your current password.</p>
                </div>

                {/* ════ ACCESSIBILITY — its own card, same as the student/principal Settings pages ════ */}
                <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="w-1 h-5 rounded-full bg-secondary" />
                    <h3 className="text-base font-extrabold text-on-surface">Accessibility</h3>
                  </div>
                  <p className="text-[12px] text-on-surface-variant -mt-4 mb-2">Changes apply immediately and are saved automatically.</p>

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

                  <AccessRow icon="palette" iconBg="bg-purple-500" title="Color Mode" desc="Choose a color mode that works best for you.">
                    <div className="relative">
                      <select value={colorMode} onChange={(e) => setColorMode(e.target.value)} className={selectCls}>
                        {["Default", "Dark", "High Contrast", "Color Blind"].map((o) => <option key={o}>{o}</option>)}
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
              </>
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
    </TeacherLayout>
  );
}
