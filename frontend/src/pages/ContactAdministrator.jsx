import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { contactAdminRequest } from "../api/auth.js";
import schoolImage from "../assets/newloginpic.webp";

const REASONS = [
  "Account Access",
  "Password Reset",
  "Technical Problem",
  "Incorrect Profile Information",
  "Enrollment or Account Activation",
  "General Inquiry",
];

export default function ContactAdministrator() {
  const navigate = useNavigate();

  const [form, setForm]       = useState({ full_name: "", id_number: "", reason: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [submitted, setSubmitted] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim() || !form.id_number.trim() || !form.reason || !form.message.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await contactAdminRequest({ ...form, id_number: form.id_number.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message ?? err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant/40 rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all font-body text-on-surface placeholder:text-outline";
  const labelClass = "block text-sm font-bold text-on-surface font-label mb-1.5";

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-surface-container-low rounded-xl shadow-2xl">

        {/* Left: Branding */}
        <div className="relative hidden lg:flex flex-col justify-end p-12 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img src={schoolImage} alt="Lifegiver Christian Academy" className="w-full h-full object-cover" />
          </div>
          <div className="relative z-10">
            <div className="mt-6 flex items-center justify-center gap-2">
            </div>
          </div>
        </div>

        {/* Right: Form / Success */}
        <div className="bg-surface-container-lowest p-4 sm:p-8 md:p-14 lg:p-16 flex flex-col justify-center">

          {!submitted ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shrink-0">
                  <span className="material-symbols-outlined">support_agent</span>
                </div>
                <div>
                  <h1 className="text-primary text-2xl font-headline font-extrabold tracking-tight">Contact Administrator</h1>
                  <p className="text-on-surface-variant font-body text-sm">Submit your request and our administrative team will reach out shortly.</p>
                </div>
              </div>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm font-body flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input className={inputClass} placeholder="Enter your full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>ID Number</label>
                  <input className={inputClass} inputMode="numeric" placeholder="Enter your ID Number" value={form.id_number} onChange={(e) => set("id_number", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Reason for Contact</label>
                  <select
                    className={`${inputClass} cursor-pointer ${form.reason ? "" : "text-outline"}`}
                    value={form.reason}
                    onChange={(e) => set("reason", e.target.value)}
                  >
                    <option value="" disabled>Select a reason</option>
                    {REASONS.map((r) => <option key={r} value={r} className="text-on-surface">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Message</label>
                  <textarea
                    rows={4}
                    className={`${inputClass} resize-none`}
                    placeholder="Describe your request in detail..."
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary text-white font-headline font-bold rounded-lg shadow-sm active:scale-[0.98] transition-all hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                  {loading ? "Sending…" : "Send Message"}
                </button>
              </form>

              <div className="mt-8 flex items-center gap-4">
                <div className="flex-1 h-px bg-outline-variant/30" />
                <span className="text-xs text-on-surface-variant font-label">or</span>
                <div className="flex-1 h-px bg-outline-variant/30" />
              </div>
              <button
                onClick={() => navigate("/login")}
                className="mt-5 w-full text-center text-sm font-bold text-primary hover:text-surface-tint transition-colors font-label"
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="relative w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-3xl">send</span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-sm">check</span>
                  </span>
                </div>
              </div>
              <div className="text-center space-y-3 mb-8">
                <h1 className="text-primary text-2xl font-headline font-extrabold tracking-tight">Message Sent!</h1>
                <p className="text-on-surface-variant font-body text-sm leading-relaxed">
                  Your request has been submitted to the administrator. They will review it and reach out to you shortly.
                </p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-4 bg-primary text-white font-headline font-bold rounded-lg shadow-sm hover:shadow-lg hover:shadow-primary/10 transition-all flex items-center justify-center gap-2"
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
