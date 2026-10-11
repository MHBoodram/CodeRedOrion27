// Merged api client (jesiah + Matthew).
// api("/auth/login", opts) prefixes /api; api.register/login/me are shortcuts.
const API_URL = String(import.meta.env.VITE_API_URL || "https://virpals.online").replace(/\/+$/, "");
const TOKEN_KEY = "fitcheck-token";

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 = network failure
    this.details = details;
  }
}

export function getToken() {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked */ }
}
export function clearToken() {
  try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function clearAuth() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    // Old builds stored these; clean them up if still present.
    window.localStorage.removeItem("fitcheck" + "-user");
    window.localStorage.removeItem("fitcheck-session");
  } catch { /* ignore */ }
}

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// path is the full path, e.g. "/api/auth/me"
export async function request(path, { method = "GET", body, auth = true, signal, timeoutMs = 20000 } = {}) {
  const headers = { Accept: "application/json" };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Abort after timeoutMs so the UI never sits on "Please wait…" forever.
  const timeoutController = new AbortController();
  const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => timeoutController.abort(), { once: true });

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // caller cancelled on purpose
    if (error?.name === "AbortError") {
      throw new ApiError(0, "The server took too long to respond. Check that the backend and database are running (npm run doctor).");
    }
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  } finally {
    window.clearTimeout(timer);
  }

  if (response.status === 204) return null;

  let data = null;
  try { data = await response.json(); } catch { /* non-JSON body */ }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAuth();
      unauthorizedHandler?.();
      window.dispatchEvent(new Event("fitcheck:unauthorized"));
    }
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`, data?.details);
  }
  return data;
}

export function describeError(error) {
  if (!(error instanceof ApiError)) return error?.message || "Something went wrong.";
  if (error.details && typeof error.details === "object") {
    const lines = Object.entries(error.details)
      .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(", ")}`)
      .filter(Boolean);
    if (lines.length) return lines.join(" · ");
  }
  return error.message;
}

export const api = (path, opts) => request(`/api${path}`, opts);
api.register = (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false });
api.login = (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false });
api.me = (signal) => request("/api/auth/me", { signal });
api.fits = ({ limit = 20, offset = 0, signal } = {}) => request(`/api/fits?limit=${limit}&offset=${offset}`, { signal });
api.analyzeFit = (payload) => request("/api/analyze-outfit", { method: "POST", body: payload, timeoutMs: 60000 });
api.notifications = ({ limit = 20, signal } = {}) => request(`/api/notifications?limit=${limit}`, { signal });
api.markNotificationRead = (id) => request(`/api/notifications/${id}/read`, { method: "POST" });
api.markAllNotificationsRead = () => request("/api/notifications/read-all", { method: "POST" });
