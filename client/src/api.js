// Tiny fetch wrapper for the FitCheck backend. All paths are relative to /api.
const TOKEN_KEY = "fitcheck-token";
const USER_KEY = "fitcheck-user";
 
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}
 
export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
 
// Stores the JWT plus the fields HomePage reads from "fitcheck-user".
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
  window.localStorage.removeItem("fitcheck-session"); // legacy demo session
}
 
export function clearAuth() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem("fitcheck-session");
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
 
// Turns zod field errors ({ field: ["msg"] }) into one readable sentence.
export function describeError(error) {
  if (error?.details && typeof error.details === "object") {
    const messages = Object.values(error.details).flat().filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
 
export async function api(path, { method = "GET", body, auth = true, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
 
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the server. Is the backend running?");
  }
 
  if (response.status === 204) return null;
 
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body; fall through to the generic message below.
  }
 
  if (!response.ok) {
    if (response.status === 401 && auth && token) {
      clearAuth();
      window.dispatchEvent(new Event("fitcheck:unauthorized"));
    }
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`, data?.details);
  }
  return data;
}
 