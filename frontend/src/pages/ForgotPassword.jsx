import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPasswordRequest } from "../api/auth.js";
import schoolImage from "../assets/loginpic.webp";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [idNumber, setIdNumber]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!idNumber.trim()) {
      setError("Please enter your ID number.");
      return;
    }
    setLoading(true);
    try {
      await forgotPasswordRequest(idNumber.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-surface-container-low rounded-xl shadow-2xl">

        {/* ── Left: Branding panel ── */}
        <div className="relative hidden lg:flex flex-col justify-end p-12 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img src={schoolImage} alt="Lifegiver Christian Academy" className="w-full h-full object-cover" />
          </div>
          <div className="relative z-10">
            <div className="mt-6 flex items-center justify-center gap-2">
              <div className="h-1 w-12 bg-secondary rounded-full" />
              <span className="text-secondary-fixed text-sm font-label font-semibold tracking-wider">
                Founded 2007
              </span>
              <div className="h-1 w-12 bg-secondary rounded-full" />
            </div>
          </div>
        </div>

        {/* ── Right: Form / Success panel ── */}
        <div className="bg-surface-container-lowest p-8 md:p-16 lg:p-20 flex flex-col justify-center">

          {!submitted ? (
            <>
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-2xl">lock_open</span>
                </div>
              </div>

              <div className="text-center space-y-2 mb-8">
                <h1 className="text-primary text-2xl md:text-3xl font-headline font-extrabold tracking-tight">
                  Request Password Assistance
                </h1>
                <p className="text-on-surface-variant font-body text-sm max-w-sm mx-auto leading-relaxed">
                  Enter your ID Number and we'll notify the administrator. A temporary password or reset
                  link will be sent to your registered email.
                </p>
              </div>

              {error && (
                <div className="mb-6 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm font-body flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  {error}
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label htmlFor="idNumber" className="block text-sm font-bold text-on-surface font-label">
                    Account ID Number
                  </label>
                  <div className="relative">
                    <input
                      id="idNumber"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="ID Number"
                      required
                      className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant/40 rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all font-body text-on-surface placeholder:text-outline pr-11"
                    />
                    <span className="material-symbols-outlined absolute inset-y-0 right-3 flex items-center text-outline">person</span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">info</span>
                    Use the ID number provided by the school.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary text-white font-headline font-bold rounded-lg shadow-sm active:scale-[0.98] transition-all hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                  {loading ? "Submitting…" : "Submit Request"}
                </button>
              </form>

              <div className="mt-8 flex items-center gap-4">
                <div className="flex-1 h-px bg-outline-variant/30" />
                <span className="text-xs text-on-surface-variant font-label">or</span>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>

              <button
                onClick={() => navigate("/login")}
                className="mt-6 w-full text-center text-sm font-bold text-primary hover:text-surface-tint transition-colors font-label"
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              {/* Success icon */}
              <div className="flex justify-center mb-6">
                <div className="relative w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-3xl">send</span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-sm">check</span>
                  </span>
                </div>
              </div>

              <div className="text-center space-y-4 mb-6">
                <h1 className="text-primary text-2xl md:text-3xl font-headline font-extrabold tracking-tight">
                  Request Submitted!
                </h1>
                <p className="text-on-surface-variant font-body text-sm leading-relaxed">
                  Your password reset request has been sent to the administrator.
                </p>
                <p className="text-on-surface-variant font-body text-sm leading-relaxed">
                  Please wait for a temporary password or reset link to be sent to your registered email.
                </p>
              </div>

              <div className="rounded-2xl bg-green-50 border border-green-100 p-5 flex items-start gap-3 mb-8">
                <span className="material-symbols-outlined text-green-600 shrink-0">schedule</span>
                <div>
                  <p className="text-sm font-bold text-green-800">What happens next?</p>
                  <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
                    The administrator will verify your request and send you an email with instructions.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate("/login")}
                className="w-full py-4 bg-primary text-white font-headline font-bold rounded-lg shadow-sm active:scale-[0.98] transition-all hover:shadow-lg hover:shadow-primary/10 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                Back to Login
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
