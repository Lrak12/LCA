// Two-step verified email change, shared by the student and supervisor settings pages.
// Step 1: enter a new email -> a 6-digit code is sent to it. Step 2: enter the code
// -> the email is applied. The parent supplies the API calls so this stays role-agnostic.
//   requestCode(newEmail)       -> Promise (throws with a message on failure)
//   verifyCode(code, newEmail)  -> Promise<string newEmail> (throws on failure)
//   onChanged(newEmail)         -> called after a successful change
import { useState } from "react";

export default function EmailChangeModal({ currentEmail, requestCode, verifyCode, onChanged, onClose }) {
  const [step,     setStep]     = useState("email"); // "email" | "code"
  const [newEmail, setNewEmail] = useState("");
  const [code,     setCode]     = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [info,     setInfo]     = useState("");

  const send = async () => {
    setError(""); setInfo("");
    if (!newEmail.trim()) { setError("Please enter your new email address."); return; }
    setBusy(true);
    try {
      await requestCode(newEmail.trim());
      setStep("code");
      setInfo(`We sent a 6-digit code to ${newEmail.trim()}.`);
    } catch (err) {
      setError(err.message ?? "Failed to send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(""); setInfo("");
    if (!code.trim()) { setError("Please enter the verification code."); return; }
    setBusy(true);
    try {
      const email = await verifyCode(code.trim(), newEmail.trim());
      onChanged?.(email ?? newEmail.trim());
      onClose?.();
    } catch (err) {
      setError(err.message ?? "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full border border-outline-variant/40 rounded-lg px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:outline-none";
  const btnPrimary = "px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
         onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-outline-variant/20">
          <div>
            <h2 className="font-headline text-lg font-extrabold text-primary">Change Email Address</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {step === "email"
                ? "We'll send a verification code to your new address."
                : "Enter the 6-digit code we emailed you."}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}
          {info && !error && (
            <div className="px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">mark_email_read</span>{info}
            </div>
          )}

          {step === "email" ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Current email</label>
                <input value={currentEmail ?? ""} disabled className={`${inputCls} bg-surface-container-low text-on-surface-variant cursor-not-allowed`} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">New email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && send()}
                  placeholder="you@example.com"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">Cancel</button>
                <button onClick={send} disabled={busy} className={btnPrimary}>{busy ? "Sending…" : "Send code"}</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Verification code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && !busy && verify()}
                  placeholder="000000"
                  className={`${inputCls} text-center text-2xl font-extrabold tracking-[0.4em]`}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => { setStep("email"); setCode(""); setInfo(""); setError(""); }} className="font-bold text-on-surface-variant hover:text-primary">
                  Use a different email
                </button>
                <button onClick={send} disabled={busy} className="font-bold text-primary hover:underline disabled:opacity-60">
                  Resend code
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors">Cancel</button>
                <button onClick={verify} disabled={busy} className={btnPrimary}>{busy ? "Verifying…" : "Verify & update"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
