// Single place the client talks to the FitCheck backend.
// - Base URL comes from VITE_API_URL (see .env.example)
// - Sends JSON, attaches "Authorization: Bearer <token>" when a token is stored
// - Throws ApiError { status, message, details } for every failure
// - A 401 on an authenticated call clears the token and notifies the app

const BASE = String(import.meta.env?.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const TOKEN_KEY = "fitcheck-token";

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 = network failure / server unreachable
    this.details = details; // zod field errors from the backend, when present
  }
}

// ---- token storage (every access is guarded: storage can be blocked) ----
export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked: session will not survive a refresh */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// AuthProvider registers a callback so a 401 anywhere logs the user out in React state.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// ---- core request ----
// opts: { method, body, auth = true, signal }
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
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body (e.g. a proxy error page) */
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      // Token was sent but rejected: expired or invalid. Drop it and tell the app.
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError(
      response.status,
      data?.error || `Request failed (${response.status})`,
      data?.details,
    );
  }
  return data;
}

// Turns an ApiError into one readable line for forms (field errors win over the generic message).
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

// ---- endpoints (Phase 1: auth only; later phases add more here) ----
export const api = {
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  me: (signal) => request("/api/auth/me", { signal }),
};
