// Admin account settings: profile, email, password.
// Backend chain (frontend api/admin.js -> routes/admin.routes.js):
//   read:     GET  /admin/account          -> controllers/account.controller.js > getAccount (~line 7)     -> services/account.service.js > getAccount (~line 15)
//   save:     PUT  /admin/account          -> controllers/account.controller.js > updateAccount (~line 12)  -> services/account.service.js > updateAccount (~line 39)
//   password: POST /admin/account/password -> controllers/account.controller.js > changePassword (~line 23) -> services/account.service.js > changePassword (~line 67)
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout.jsx";
import { fetchAccount, updateAccount, changeAccountPassword } from "../../api/admin.js";
import UserPasswordResets from "./UserPasswordResets.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSchoolYear } from "../../hooks/useSchoolYear.js";

const fillStyle = { fontVariationSettings: '"FILL" 1' };

// two tabs: the profile/password form, and the reused password-resets page
const TABS = [
  { key: "profile", label: "Profile Settings"    },
  { key: "resets",  label: "User Password Resets" },
];

// role value -> display label (teacher shows as "Supervisor")
const ROLE_LABEL = {
  administrator: "Administrator", principal: "Principal",
  teacher: "Supervisor", student: "Student",
};

// live password-strength checklist for the new password field
const PW_RULES = [
  { key: "len",   label: "At least 8 characters",     test: (p) => p.length >= 8 },
  { key: "lower", label: "Contains lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "upper", label: "Contains uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "num",   label: "Contains number",           test: (p) => /[0-9]/.test(p) },
  { key: "spec",  label: "Contains special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-surface-container-high rounded-lg ${className}`} />
);

const INPUT_CLS = "w-full bg-white border border-outline-variant/40 rounded-lg px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:outline-none";

// Module-level so it isn't remounted each render (which would drop input focus).
const PwField = ({ label, value, onChange, show, onToggle }) => (
  <div>
    <label className="block text-[13px] font-semibold text-on-surface mb-1.5">{label}</label>
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={label}
        className={`${INPUT_CLS} pr-10`}
      />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
        <span className="material-symbols-outlined text-lg">{show ? "visibility_off" : "visibility"}</span>
      </button>
    </div>
  </div>
);

export default function AccountSettings() {
  const schoolYearLabel = useSchoolYear();
  const { logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]       = useState("profile"); // active tab
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [banner, setBanner]   = useState("");      // success toast text

  const [account, setAccount] = useState(null);    // raw account record from the API
  const [profile, setProfile] = useState({ full_name: "", email: "", contact_number: "" }); // editable profile form
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });               // password form
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false }); // per-field reveal toggles
  const [savingPw, setSavingPw] = useState(false);

  // load the admin's own account once and seed the profile form
  useEffect(() => {
    fetchAccount()                                  // GET /admin/account
      .then((res) => {
        const a = res.data;
        setAccount(a);
        setProfile({
          full_name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(), // join first/last into one field
          email: a.email ?? "",
          contact_number: "",                        // not persisted yet (no column)
        });
      })
      .catch((err) => setError(err.message ?? "Failed to load account."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {                                  // auto-dismiss the success banner
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  // save profile: split the single name field back into first/last, PUT, then sync auth context
  const saveProfile = async () => {
    setError("");
    if (!profile.contact_number.trim()) return setError("Contact number is required.");
    setSavingProfile(true);
    try {
      const parts = profile.full_name.trim().split(/\s+/);
      const last_name  = parts.length > 1 ? parts.pop() : ""; // last token is the surname
      const first_name = parts.join(" ");                     // everything before it
      const res = await updateAccount({ first_name, last_name, email: profile.email.trim() }); // PUT /admin/account
      setAccount(res.data);
      updateUser({ first_name: res.data.first_name, last_name: res.data.last_name, email: res.data.email }); // refresh header/sidebar
      setBanner("Profile updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const pwChecks = PW_RULES.map((r) => ({ ...r, ok: r.test(pw.next) })); // each rule + whether the new pw passes it
  const pwValid  = pwChecks.every((c) => c.ok) && pw.next === pw.confirm && pw.current.length > 0; // gate the submit button

  // change password: verified server-side against the current password
  const updatePassword = async () => {
    setError("");
    if (pw.next !== pw.confirm) return setError("New passwords do not match.");
    setSavingPw(true);
    try {
      await changeAccountPassword({ current_password: pw.current, new_password: pw.next }); // POST /admin/account/password
      setPw({ current: "", next: "", confirm: "" });  // clear the form on success
      setBanner("Password updated.");
    } catch (err) {
      setError(err.message ?? "Failed to update password.");
    } finally {
      setSavingPw(false);
    }
  };

  const onLogout = async () => { await logout(); navigate("/login"); };

  const initials = (profile.full_name || "A").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase(); // avatar initials
  const toggleShow = (id) => () => setShowPw((s) => ({ ...s, [id]: !s[id] })); // curried show/hide per password field

  return (
    <AdminLayout schoolYearLabel={schoolYearLabel}>
      <main className="p-4 sm:p-8 max-w-full mx-auto w-full">

        <header className="mb-8">
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Account Settings</h2>
          <p className="text-on-surface-variant mt-1">Manage account security and password reset requests.</p>
        </header>

        {banner && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={fillStyle}>check_circle</span>{banner}
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>{error}
          </div>
        )}

        {/* Tabs -> setTab(key) switches between Profile Settings and the reused User Password Resets page */}
        <div className="border-b border-outline-variant/30 mb-6">
          <div className="flex gap-6 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "profile" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Profile Information */}
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
                    <span className="material-symbols-outlined" style={fillStyle}>person</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-lg font-extrabold text-on-surface">Profile Information</h3>
                    <p className="text-sm text-on-surface-variant">Update your personal information and profile.</p>
                  </div>
                </div>

                {loading ? <Skeleton className="h-64" /> : (
                  <>
                    <div className="flex flex-col items-center mb-6 pb-6 border-b border-outline-variant/20">
                      <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-xl mb-2">{initials}</div>
                      <p className="font-headline text-lg font-extrabold text-on-surface">{profile.full_name || "—"}</p>
                      <span className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-container text-on-surface-variant">
                        {ROLE_LABEL[account?.role] ?? account?.role ?? "—"}
                      </span>
                    </div>

                    {/* profile inputs -> setProfile(field); Save -> saveProfile() (updateAccount) */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Full Name</label>
                        <input value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} className={INPUT_CLS} placeholder="Your name" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-on-surface mb-1.5">Email Address</label>
                        <input type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className={INPUT_CLS} placeholder="name@lca.edu.ph" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-on-surface mb-1.5">
                          Contact Number <span className="font-normal text-outline">(not saved yet)</span>
                        </label>
                        <input required value={profile.contact_number} onChange={(e) => setProfile((p) => ({ ...p, contact_number: e.target.value }))} className={INPUT_CLS} placeholder="0917 123 4567" />
                      </div>
                      {/* Save Changes -> saveProfile() */}
                      <button onClick={saveProfile} disabled={savingProfile}
                        className="w-full py-3 bg-primary text-white font-bold rounded-lg shadow-sm hover:shadow-lg transition-all disabled:opacity-60">
                        {savingProfile ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Password Management */}
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
                    <span className="material-symbols-outlined" style={fillStyle}>lock</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-lg font-extrabold text-on-surface">Password Management</h3>
                    <p className="text-sm text-on-surface-variant">Change your account password to maintain security.</p>
                  </div>
                </div>

                {/* password fields -> setPw(field); toggleShow flips visibility; pwChecks/pwValid gate the button */}
                <div className="space-y-4">
                  <PwField label="Current Password" value={pw.current} show={showPw.current} onToggle={toggleShow("current")} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PwField label="New Password" value={pw.next} show={showPw.next} onToggle={toggleShow("next")} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
                    <PwField label="Confirm New Password" value={pw.confirm} show={showPw.confirm} onToggle={toggleShow("confirm")} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
                  </div>

                  <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/20 p-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="material-symbols-outlined text-base text-on-surface-variant" style={fillStyle}>shield</span>
                      <p className="text-sm font-bold text-on-surface">Password Requirements</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                      {pwChecks.map((c) => (
                        <div key={c.key} className="flex items-center gap-2 text-[13px]">
                          <span className={`material-symbols-outlined text-base ${c.ok ? "text-green-600" : "text-outline"}`} style={c.ok ? fillStyle : undefined}>
                            {c.ok ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          <span className={c.ok ? "text-on-surface" : "text-on-surface-variant"}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Update Password -> updatePassword() (changeAccountPassword); disabled until pwValid */}
                  <div className="flex justify-end">
                    <button onClick={updatePassword} disabled={!pwValid || savingPw}
                      className="px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-sm hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                      {savingPw ? "Updating…" : "Update Password"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Log Out -> onLogout() (logout() then navigate to /login) */}
            <div className="flex justify-end mt-6">
              <button onClick={onLogout}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-outline-variant/30 text-red-600 font-bold rounded-xl shadow-sm hover:bg-red-50 transition-all">
                <span className="material-symbols-outlined text-lg">logout</span>
                Log Out
              </button>
            </div>
          </>
        )}

        {/* resets tab reuses the UserPasswordResets page content (embedded = no nested AdminLayout) */}
        {tab === "resets" && <UserPasswordResets embedded />}
      </main>
    </AdminLayout>
  );
}
