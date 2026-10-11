import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

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
  if (status === "authed") return <Outlet />;
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

// Wrap /login and /signup: signed-in users go straight to the app.
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authed") return <Navigate to="/home" replace />;
  return <Outlet />;
}