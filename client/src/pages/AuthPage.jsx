import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import girlLogo from "../assets/Girl(7).svg";
import { describeError } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./Auth.css";

const MIN_PASSWORD = 8; // must match the server's registerSchema

function AuthBrand() {
  return (
    <div className="auth-brand" aria-label="Fit Check brand mark">
      <img className="auth-brand-logo" src={girlLogo} alt="Fit Check logo" />
    </div>
  );
}

// Turns an API error into a friendly message.
function friendlyError(error, isSignup) {
  if (error?.status === 401) return "Invalid username/email or password.";
  if (error?.status === 409) return "That username or email is already in use.";
  if (error?.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (error?.status === 400) return describeError(error); // field errors from `details`
  if (error?.status >= 500) return "The server hit a problem. Please try again.";
  return describeError(error) || (isSignup ? "Could not create your account." : "Could not log you in.");
}

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();

  // After auth, return to the page the user was trying to open (set by ProtectedRoute), else /home.
  const destination = location.state?.from || "/home";

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage("");

    if (isSignup && formData.get("password") !== formData.get("confirm_password")) {
      setMessage("Those passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        // confirm_password is a client-only check and is never sent.
        const payload = {
          username: formData.get("username").trim(),
          email: formData.get("email").trim().toLowerCase(),
          password: formData.get("password"),
        };
        const displayName = formData.get("display_name")?.trim();
        if (displayName) payload.display_name = displayName;
        await register(payload);
      } else {
        await login(formData.get("identifier").trim(), formData.get("password"));
      }
      navigate(destination, { replace: true });
    } catch (error) {
      setMessage(friendlyError(error, isSignup));
    } finally {
      setSubmitting(false);
    }
  }

  // Dev-only shortcut: signs in as the seeded demo user through the REAL API, so you get a
  // real token and every authed call (feed, analyze) works. Needs `npm run seed` to have run.
  async function handleDemoLogin() {
    setMessage("");
    setSubmitting(true);
    try {
      await login("alice", "password123");
      navigate(destination, { replace: true });
    } catch (error) {
      setMessage(`Demo login failed: ${friendlyError(error, false)} (is the backend running and seeded?)`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`auth-page${isSignup ? " auth-page-signup" : ""}`}>
      <AuthBrand />
      <section className={`auth-panel${isSignup ? " auth-panel-signup" : ""}`} aria-labelledby="auth-heading">
        <p className="auth-kicker">YOUR PERSONAL STYLE EDIT</p>
        <h1 id="auth-heading">{isSignup ? "Create your profile" : "Welcome back."}</h1>
        <p className="auth-description">
          {isSignup
            ? "A few details, then your style story starts."
            : "Step back into your personal style edit."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                minLength="3"
                maxLength="30"
                pattern="[A-Za-z0-9_]{3,30}"
                title="Use 3 to 30 letters, numbers, or underscores."
                required
              />

              <label htmlFor="display-name">Display name (optional)</label>
              <input
                id="display-name"
                name="display_name"
                type="text"
                autoComplete="name"
                maxLength="60"
              />

              <label htmlFor="signup-email">Email address</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />

              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                maxLength="100"
                title={`At least ${MIN_PASSWORD} characters.`}
                required
              />

              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                maxLength="100"
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="login-identifier">Username or email</label>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
              />

              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : isSignup ? "Create account" : "Log in"}
          </button>
          {import.meta.env.DEV && !isSignup && (
            <button className="auth-demo-admin" type="button" onClick={handleDemoLogin} disabled={submitting}>
              Continue as demo user (dev only)
            </button>
          )}
        </form>

        {message && <p className="auth-message" role="alert">{message}</p>}
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to Fit Check?"}{" "}
          <Link to={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Log in" : "Create account"}
          </Link>
        </p>
        <p className="auth-security-note">Your password is sent securely to the server and is never stored in the browser.</p>
      </section>
    </main>
  );
}