import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import girlLogo from "../../Girl.svg";
import "./Auth.css";

function AuthBrand() {
  return (
    <div className="auth-brand" aria-label="Fit Check brand mark">
      <img className="auth-brand-logo" src={girlLogo} alt="Fit Check logo" />
      <span>FIT CHECK</span>
    </div>
  );
}

function ProfileFields() {
  return (
    <details className="profile-fields">
      <summary>Add profile details <span>(optional)</span></summary>
      <div className="profile-fields-list">
        <label htmlFor="display-name">Display name</label>
        <input id="display-name" name="display_name" autoComplete="name" />

        <label htmlFor="avatar-url">Avatar URL</label>
        <input id="avatar-url" name="avatar_url" type="url" placeholder="https://" />

        <label htmlFor="bio">Style bio</label>
        <textarea id="bio" name="bio" rows="3" />
      </div>
    </details>
  );
}

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    if (isSignup) {
      if (formData.get("password") !== formData.get("confirm_password")) {
        setMessage("Those passwords do not match.");
        return;
      }
    }

    setMessage(isSignup
      ? "Account creation is not connected yet. Your details have not been saved or sent."
      : "Login is not connected yet. Your details have not been checked or saved.");
  }

  function handleDemoAdmin() {
    setMessage("Demo admin mode is for preview only and is not authenticated.");
    navigate("/home");
  }

  return (
    <main className="auth-page">
      <img
        className="auth-backdrop"
        src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1800&q=90"
        alt=""
        aria-hidden="true"
      />
      <section className={`auth-panel${isSignup ? " auth-panel-signup" : ""}`} aria-labelledby="auth-heading">
        <AuthBrand />
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
              <ProfileFields />
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

          <button type="submit">{isSignup ? "Create account" : "Log in"}</button>
        </form>

        {!isSignup && (
          <button className="auth-demo-admin" type="button" onClick={handleDemoAdmin}>
            Continue as demo admin
          </button>
        )}
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to Fit Check?"}{" "}
          <Link to={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Log in" : "Create account"}
          </Link>
        </p>
        <p className="auth-security-note">Your details are not stored in browser storage.</p>
      </section>
    </main>
  );
}