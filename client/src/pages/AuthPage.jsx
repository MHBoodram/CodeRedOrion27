import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, describeError, saveAuth } from "../api.js";
import girlLogo from "../assets/Girl(2).svg";
import "./Auth.css";

function AuthBrand() {
  return (
    <div className="auth-brand" aria-label="Fit Check brand mark">
      <img className="auth-brand-logo" src={girlLogo} alt="Fit Check logo" />
    </div>
  );
}

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");

    if (isSignup && formData.get("password") !== formData.get("confirm_password")) {
      setMessage("Those passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      let session;
      if (isSignup) {
        const body = {
          username: formData.get("username").trim(),
          email: formData.get("email").trim().toLowerCase(),
          password: formData.get("password"),
        };
        const displayName = formData.get("display_name")?.trim();
        if (displayName) body.display_name = displayName;
        session = await api("/auth/register", { method: "POST", body, auth: false });
      } else {
        session = await api("/auth/login", {
          method: "POST",
          body: {
            identifier: formData.get("identifier").trim(),
            password: formData.get("password"),
          },
          auth: false,
        });
      }

      saveAuth(session);
      navigate("/home");
    } catch (error) {
      setMessage(describeError(error));
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
                minLength="10"
                required
              />

              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength="10"
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
        </form>

        {message && <p className="auth-message" role="status">{message}</p>}
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