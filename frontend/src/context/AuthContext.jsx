import { createContext, useContext, useState, useEffect } from "react";
import { loginRequest, logoutRequest, getMeRequest } from "../api/auth.js";
import { notifySessionClosing, watchSessionEvents } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState("");

  useEffect(() => {
    // Older versions persisted this warning and replayed it on every visit.
    // A replacement notice is only relevant when the current token fails.
    sessionStorage.removeItem("lca_session_message");
    const restoreSession = async () => {
      const token = localStorage.getItem("lca_token");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await getMeRequest();
        if (localStorage.getItem("lca_token") === token) setUser(res.data);
      } catch (error) {
        if (localStorage.getItem("lca_token") === token) {
          // Keep the token through temporary network/server failures. Clearing
          // a valid token here would leave its server-side session locked.
          if (error.status === 401) {
            localStorage.removeItem("lca_token");
            localStorage.removeItem("lca_user");
          }
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const handleSessionEnded = (event) => {
      setUser(null);
      if (event.detail?.replacedByAnotherDevice) {
        setSessionNotice(event.detail.message);
      }
    };
    window.addEventListener("lca:session-ended", handleSessionEnded);
    return () => window.removeEventListener("lca:session-ended", handleSessionEnded);
  }, []);

  // Keep one lightweight event stream open while signed in. A new login pushes
  // an immediate replacement event to the old device without polling /auth/me.
  useEffect(() => {
    if (!user) return undefined;

    window.addEventListener("pagehide", notifySessionClosing);
    const controller = new AbortController();
    let stopped = false;

    const connect = async () => {
      while (!stopped) {
        try {
          await watchSessionEvents({
            signal: controller.signal,
            onSessionReplaced: (message) => {
              localStorage.removeItem("lca_token");
              localStorage.removeItem("lca_user");
              setSessionNotice(message);
              setUser(null);
            },
          });
        } catch (error) {
          if (error.name === "AbortError") return;
        }

        if (!stopped) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
    };
    connect();

    return () => {
      window.removeEventListener("pagehide", notifySessionClosing);
      stopped = true;
      controller.abort();
    };
  }, [user]);

  const login = async (id_number, password) => {
    const res = await loginRequest(id_number, password);

    localStorage.setItem("lca_token", res.data.access_token);
    localStorage.setItem("lca_user", JSON.stringify(res.data.user));

    setSessionNotice("");
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } catch {
      // proceed with local logout even if server call fails
    } finally {
      localStorage.removeItem("lca_token");
      localStorage.removeItem("lca_user");
      setSessionNotice("");
      setUser(null);
    }
  };

  const updateUser = (updates) => setUser((prev) => ({ ...prev, ...updates }));

  const dismissSessionNotice = () => {
    sessionStorage.removeItem("lca_session_message");
    setSessionNotice("");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
      {sessionNotice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-ended-title"
            aria-describedby="session-ended-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="session-ended-title" className="text-xl font-bold text-primary">
              Account signed in on another device
            </h2>
            <p id="session-ended-description" className="mt-2 text-sm leading-6 text-on-surface-variant">
              Someone logged into this account on another device. For your
              security, this device has been logged out.
            </p>
            <button
              type="button"
              autoFocus
              onClick={dismissSessionNotice}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            >
              Continue to login
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
