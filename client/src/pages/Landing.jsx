import { Link } from "react-router-dom";
import girlLogo from "../../../Girl(2).svg";
import "./SignIn.css";

function BrandMark() {
  return (
    <div className="sign-in-brand" aria-label="Fit Check brand mark">
      <img className="sign-in-brand-logo" src={girlLogo} alt="Fit Check logo" />
    </div>
  );
}

export default function Landing() {
  return (
    <main className="sign-in-page">
      <BrandMark />
      <section className="sign-in-content" aria-labelledby="welcome-heading">
        <p className="sign-in-kicker">YOUR PERSONAL STYLE EDIT</p>
        <h1 id="welcome-heading">Get dressed.<br />Feel <em>like you.</em></h1>
        <p className="sign-in-copy">Your next favorite outfit starts with a fresh perspective.</p>
        <Link className="sign-in-action" to="/signup">
          Create your profile <span aria-hidden="true">&#8594;</span>
        </Link>
        <p className="account-note">Already have an account? <Link to="/login">Log in</Link></p>
        <p className="sign-in-footer">STYLE THAT FEELS LIKE YOU</p>
      </section>
    </main>
  );
}
