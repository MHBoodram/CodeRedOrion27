import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

// TEMP (remove in Phase 2): the current AuthPage still "logs in" via localStorage and
// never gets a backend token. Until Phase 2 replaces it, let those fake sessions through
// so /home keeps working. Delete this function and its use below when Phase 2 lands.
function hasLegacySession() {
  try {
    return Boolean(window.localStorage.getItem("fitcheck-user") || window.localStorage.getItem("fitcheck-session"));
  } catch {
    return false;
  }
}

function Splash() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#681219", fontFamily: "Montserrat, sans-serif" }}>
      Loading…
    </main>
  );
}

// Wrap private routes: <Route element={<ProtectedRoute />}> ...children... </Route>
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "authed" || hasLegacySession()) return <Outlet />;
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

// Wrap /login and /signup: signed-in users go straight to the app.
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authed") return <Navigate to="/home" replace />;
  return <Outlet />;
}
