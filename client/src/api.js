// Merged api client (jesiah + Matthew).
// api("/auth/login", opts) prefixes /api; api.register/login/me are shortcuts.
const BASE = String(import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");
const TOKEN_KEY = "fitcheck-token";
const USER_KEY = "fitcheck-user";

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

export function saveAuth({ token, user }) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
    }),
  );
  window.localStorage.removeItem("fitcheck-session");
}

export function clearAuth() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem("fitcheck-session");
  } catch { /* ignore */ }
}

let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// path is the full path, e.g. "/api/auth/me"
export async function request(path, { method = "GET", body, auth = true, signal } = {}) {
  const headers = { Accept: "application/json" };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
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
