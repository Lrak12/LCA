import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPasswordRequest, resetPasswordWithToken } from "../api/auth.js";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [idNumber, setIdNumber]   = useState(searchParams.get("id") ?? "");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [show, setShow]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [done, setDone]           = useState(false);
  // When arriving from a Supabase reset-email link, the recovery token rides in the URL
  // hash (#access_token=…&type=recovery). If present we switch to token mode: the token
  // identifies the user, so no ID number is asked.
  const [recoveryToken, setRecoveryToken] = useState(null);

  useEffect(() => {
    const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get("error_description")) {
      setError(params.get("error_description").replace(/\+/g, " "));
      return;
    }
    if (params.get("type") === "recovery" && params.get("access_token")) {
      setRecoveryToken(params.get("access_token"));
      // strip the token out of the address bar so it isn't left in history
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const tokenMode = Boolean(recoveryToken);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6)  return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      if (tokenMode) {
        await resetPasswordWithToken(recoveryToken, password);
      } else {
        await resetPasswordRequest(idNumber.trim(), password);
      }
      setDone(true);
    } catch (err) {
      setError(err.message ?? "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  const field = "w-full px-4 py-3 bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all font-body text-on-surface placeholder:text-outline";

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl p-4 sm:p-8 md:p-12">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary text-4xl">lock_reset</span>
          <div>
            <h1 className="text-primary font-headline font-extrabold text-2xl tracking-tight">Reset Password</h1>
            <p className="text-on-surface-variant text-sm">
              {tokenMode ? "Set a new password for your account." : "Verify your ID number to set a new password."}
            </p>
          </div>
        </div>

        {done ? (
          <div className="space-y-6">
            <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Password updated. You can now sign in with your new password.
            </div>
            <button
              onClick={() => navigate("/login")}
              className="w-full py-3.5 bg-gradient-to-br from-primary to-primary-container text-white font-headline font-bold rounded-lg shadow-sm hover:shadow-lg transition-all"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-base">error</span>{error}
              </div>
            )}

            {/* Arriving from a new-account email: the token identifies the user, so the ID
                field is hidden — but show the ID anyway since it's what they sign in with. */}
            {tokenMode && idNumber && (
              <div className="px-4 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary">badge</span>
                <span>Your ID number is <strong className="font-semibold">{idNumber}</strong> — use it to sign in.</span>
              </div>
            )}

            {!tokenMode && (
              <div className="space-y-2">
                <label htmlFor="id" className="block text-sm font-medium text-on-surface font-label">ID Number</label>
                <input id="id" type="text" inputMode="numeric" pattern="[0-9]*" value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)} placeholder="Your school ID number" required className={field} />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="pw" className="block text-sm font-medium text-on-surface font-label">New Password</label>
              <div className="relative">
                <input id="pw" type={show ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={`${field} pr-12`} />
                <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-3 flex items-center text-outline hover:text-primary">
                  <span className="material-symbols-outlined text-xl">{show ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="cf" className="block text-sm font-medium text-on-surface font-label">Confirm Password</label>
              <input id="cf" type={show ? "text" : "password"} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required className={field} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-gradient-to-br from-primary to-primary-container text-white font-headline font-bold rounded-lg shadow-sm hover:shadow-lg transition-all disabled:opacity-60">
              {loading ? "Updating…" : "Reset Password"}
            </button>

            <Link to="/login" className="block text-center text-sm font-medium text-primary hover:underline">
              Back to Sign In
            </Link>
          </form>
        )}
      </main>
    </div>
  );
}
