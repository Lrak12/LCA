// Login (all roles): the single sign-in screen. One ID-number + password form;
// on success it sends each role to its own dashboard via ROLE_DASHBOARDS below.
//
// Backend chain (login):
//   handleSubmit -> AuthContext.login (context/AuthContext.jsx ~line 32)
//     -> loginRequest (api/auth.js)                         POST /auth/login
//     -> routes/auth.routes.js  ->  controllers/auth.controller.js > login (~line 8)
//     -> services/auth.service.js > login (~line 54)
//          -> findUserBySchoolId (~line 13): looks the ID up across the role tables
//             student|teacher|principal|administrator (the ID IS the table PK), then
//             reads that user's `users` row (email/is_active/username)
//          -> supabase.auth.signInWithPassword(email, password) validates the password
//        DB touched: student|teacher|principal|administrator, users, Supabase Auth
//   The controller also writes a LOGIN audit row (audit.service.writeAudit) and returns
//   { access_token, user }. AuthContext saves the token to localStorage + setUser(...),
//   then handleSubmit navigates to ROLE_DASHBOARDS[user.role].
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import schoolImage from "../assets/newloginpic.webp";


const ROLE_DASHBOARDS = {
  principal:     "/admin/dashboard",
  administrator: "/sysadmin/dashboard",
  teacher:       "/teacher/dashboard",
  student:       "/student/dashboard",
  parent:        "/parent/dashboard",
};

export default function Login() {
  const { user, logout, login } = useAuth();
  const navigate  = useNavigate();

  // If someone reaches this page while a session is still active — most commonly
  // by pressing the browser Back button after signing in — end that session
  // automatically. Landing on /login always means "sign in fresh".
  // Mount-only (empty deps) on purpose: a normal sign-in sets `user` a moment
  // before we navigate away, and we must NOT log that in-progress login back out.
  useEffect(() => {
    if (user) logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [idNumber, setIdNumber]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // login() hits POST /auth/login (see backend chain at top) and returns the
      // authenticated user; we then jump to that role's dashboard.
      const user = await login(idNumber, password);
      navigate(ROLE_DASHBOARDS[user.role] ?? "/login");
    } catch (err) {
      setError(err.message ?? "Invalid ID number or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-4">

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-surface-container-low rounded-xl shadow-2xl">

        {/* ── Left: Branding panel ── */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src={schoolImage}
              className="w-full h-full object-cover"
            />
            
          </div>

          <div className="relative z-10">
          </div>

          <div className="relative z-10">
            <div className="mt-6 flex items-center justify-center gap-2">
            </div>
          </div>
        </div>

        {/* ── Right: Form panel ── */}
        <div className="bg-surface-container-lowest p-4 sm:p-8 md:p-16 lg:p-20 flex flex-col justify-center">

          <div className="mb-10 lg:hidden flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl">school</span>
            <span className="text-primary font-headline font-extrabold text-xl tracking-tight">LCA</span>
          </div>

          <div className="space-y-2 mb-10">
            <h1 className="text-primary text-3xl md:text-4xl font-headline font-extrabold tracking-tight">
              Welcome to LCA
            </h1>
            <p className="text-on-surface-variant font-body text-base">
              Please sign in to access the school management system.
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
              <label htmlFor="idNumber" className="block text-sm font-medium text-on-surface font-label">
                ID Number
              </label>
              <input
                id="idNumber"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="School ID number"
                required
                className="w-full px-4 py-3 bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all font-body text-on-surface placeholder:text-outline"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-on-surface font-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all font-body text-on-surface placeholder:text-outline pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center justify-center text-outline hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-xl leading-none">
                    {showPassword ? "visibility" : "visibility_off"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer appearance-none w-5 h-5 rounded border border-outline-variant checked:bg-secondary checked:border-secondary transition-all"
                  />
                  <span
                    className="material-symbols-outlined absolute text-white left-1 opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                    style={{ fontSize: "14px" }}
                  >
                    check
                  </span>
                </div>
                <span className="text-sm text-on-surface-variant font-body group-hover:text-on-surface transition-colors">
                  Remember Me
                </span>
              </label>

              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary hover:text-surface-tint transition-colors font-label"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-br from-primary to-primary-container text-white font-headline font-bold rounded-lg shadow-sm active:scale-[0.98] transition-all hover:shadow-lg hover:shadow-primary/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div  className="mt-12 pt-1 border-t border-surface-container-high flex items-center justify-center gap-1.5">
            <span className="text-sm text-on-surface-variant font-body"></span>
          </div>
        </div>
      </main>

      <div className="fixed bottom-6 left-6 hidden lg:block">
        <div className="flex items-center gap-4 text-outline-variant">
          <span className="text-[10px] tracking-widest font-bold uppercase font-label">
            Secure Access Point
          </span>
          <div className="w-2 h-2 rounded-full bg-secondary-fixed shadow-[0_0_8px_rgba(131,216,166,0.6)]" />
        </div>
      </div>
    </div>
  );
}
