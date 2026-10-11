import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
<<<<<<< HEAD
import girlLogo from "../assets/Girl(2).svg";
=======
import girlLogo from "../assets/Girl(7).svg";
>>>>>>> f013c8724235d03b73a7965efc685ee608758a57
import "./Auth.css";

const USER_STORAGE_KEY = "fitcheck-user";
const SESSION_STORAGE_KEY = "fitcheck-session";

function getSavedUser() {
  try {
    const savedUser = window.localStorage.getItem(USER_STORAGE_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

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
  const navigate = useNavigate();

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    if (isSignup) {
      if (formData.get("password") !== formData.get("confirm_password")) {
        setMessage("Those passwords do not match.");
        return;
      }

      const username = formData.get("username").trim();
      const displayName = formData.get("display_name")?.trim() || null;
      const user = {
        name: displayName || username,
        email: formData.get("email").trim().toLowerCase(),
        username,
        display_name: displayName,
        avatar_url: formData.get("avatar_url")?.trim() || null,
        bio: formData.get("bio")?.trim() || null,
      };

      if (!saveUser(user)) {
        setMessage("Could not save your profile in this browser.");
        return;
      }

      setMessage("Profile saved on this browser. Your password was not stored.");
      event.currentTarget.reset();
      navigate("/home");
      return;
    }

    const identifier = formData.get("identifier").trim().toLowerCase();
    const savedUser = getSavedUser();
    const matchesSavedUser = savedUser && (
      savedUser.email?.toLowerCase() === identifier ||
      savedUser.username?.toLowerCase() === identifier
    );

    if (!matchesSavedUser) {
      setMessage("No saved profile found. Create an account on this browser first.");
      return;
    }

    if (!saveUser(savedUser)) {
      setMessage("Could not access your saved profile in this browser.");
      return;
    }

    setMessage(`Profile found for ${savedUser.name}. Password verification requires server authentication.`);
    navigate("/home");
  }

  function handleDemoAdmin() {
    const demoSession = {
      name: "Demo Admin",
      email: "admin@fitcheck.local",
      username: "demo_admin",
      role: "admin",
      demo: true,
    };

    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(demoSession));
      setMessage("Demo admin session started on this browser. This is not secure authentication.");
      navigate("/home");
    } catch {
      setMessage("Could not start the demo admin session in this browser.");
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
        <p className="auth-security-note">Passwords are never stored in browser storage.</p>
      </section>
    </main>
  );
}