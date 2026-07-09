import { createContext, useContext, useState, useEffect } from "react";
import { loginRequest, logoutRequest, getMeRequest } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("lca_token");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await getMeRequest();
        setUser(res.data);
      } catch {
        localStorage.removeItem("lca_token");
        localStorage.removeItem("lca_user");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (id_number, password) => {
    const res = await loginRequest(id_number, password);

    localStorage.setItem("lca_token", res.data.access_token);
    localStorage.setItem("lca_user", JSON.stringify(res.data.user));

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
      setUser(null);
    }
  };

  const updateUser = (updates) => setUser((prev) => ({ ...prev, ...updates }));

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
