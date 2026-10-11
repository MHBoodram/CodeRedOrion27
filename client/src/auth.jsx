import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from "./api.js";

// status: "loading" (checking a stored token) | "authed" | "anon"
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getToken() ? "loading" : "anon"));

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("anon");
  }, []);

  // A 401 from any API call logs the user out in state as well as storage.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restore the session on load if a token is stored.
  useEffect(() => {
    if (!getToken()) return undefined;
    const controller = new AbortController();
    api
      .me(controller.signal)
      .then(({ user: me }) => {
        setUser(me);
        setStatus("authed");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        // 401 already cleared the token. For other failures (e.g. server down) fall back to
        // signed-out rather than hanging on the loading screen.
        setUser(null);
        setStatus("anon");
      });
    return () => controller.abort();
  }, []);

  const finishAuth = useCallback(({ token, user: nextUser }) => {
    setToken(token);
    setUser(nextUser);
    setStatus("authed");
    return nextUser;
  }, []);

  const login = useCallback(async (identifier, password) => finishAuth(await api.login({ identifier, password })), [finishAuth]);
  const register = useCallback(async (payload) => finishAuth(await api.register(payload)), [finishAuth]);

  // Merge fresh profile fields (e.g. after saving settings) into the signed-in user.
  const updateUser = useCallback((next) => setUser((current) => ({ ...current, ...next })), []);

  const value = useMemo(
    () => ({ user, status, isAuthed: status === "authed", login, register, logout, updateUser }),
    [user, status, login, register, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
