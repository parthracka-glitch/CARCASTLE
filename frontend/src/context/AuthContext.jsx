import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("ccg_user");
      const token = localStorage.getItem("ccg_token");
      return raw && token ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    const hasToken = Boolean(localStorage.getItem("ccg_token"));
    const hasUser = Boolean(localStorage.getItem("ccg_user"));
    // If token is present but user profile is missing, briefly load
    return hasToken && !hasUser;
  });

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ccg_token") : null;
    if (!token) {
      setUser(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("ccg_user");
      }
      setLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (isMounted) {
          if (data && typeof data === "object" && typeof data.id === "string" && data.role) {
            setUser(data);
            localStorage.setItem("ccg_user", JSON.stringify(data));
          } else {
            setUser(null);
            localStorage.removeItem("ccg_token");
            localStorage.removeItem("ccg_user");
          }
        }
      } catch (e) {
        if (isMounted) {
          // If server explicitly returns 401/403, clear session
          if (e.response?.status === 401 || e.response?.status === 403) {
            setUser(null);
            localStorage.removeItem("ccg_token");
            localStorage.removeItem("ccg_user");
          }
          // On network error or momentary server pause, keep cached user intact
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.access_token) {
      localStorage.setItem("ccg_token", data.access_token);
    }
    const userData = { id: data.id, email: data.email, name: data.name, role: data.role };
    localStorage.setItem("ccg_user", JSON.stringify(userData));
    setUser(userData);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (_e) {
      // ignore
    }
    localStorage.removeItem("ccg_token");
    localStorage.removeItem("ccg_user");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
