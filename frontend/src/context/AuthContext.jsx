import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => {
    return typeof window !== "undefined" && Boolean(localStorage.getItem("ccg_token"));
  });

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ccg_token") : null;
    if (!token) {
      setUser(null);
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
          } else {
            setUser(null);
            localStorage.removeItem("ccg_token");
          }
        }
      } catch (_e) {
        if (isMounted) {
          setUser(null);
          localStorage.removeItem("ccg_token");
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
    if (data.access_token) localStorage.setItem("ccg_token", data.access_token);
    setUser({ id: data.id, email: data.email, name: data.name, role: data.role });
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (_e) {
      // ignore
    }
    localStorage.removeItem("ccg_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
