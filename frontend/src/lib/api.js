import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = BACKEND_URL ? (BACKEND_URL.endsWith("/") ? `${BACKEND_URL}api` : `${BACKEND_URL}/api`) : "/api";

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 10000,
});

// Attach bearer token if we have one (fallback path when cookies blocked)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ccg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Validate response format to reject HTML responses returned by SPA fallback rewrite
api.interceptors.response.use(
  (response) => {
    if (
      typeof response.data === "string" &&
      (response.data.trim().startsWith("<!doctype html") || response.data.trim().startsWith("<html"))
    ) {
      const error = new Error("API endpoint returned HTML instead of JSON. Backend service might be unreachable or misconfigured.");
      error.response = { status: 404, data: { detail: error.message } };
      return Promise.reject(error);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

export function formatInr(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  try {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  } catch (_e) {
    return s;
  }
}

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
