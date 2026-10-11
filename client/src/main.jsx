import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // enables page routing
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx"; // holds the signed-in user + token
import "./index.css";

// Step 1: find the <div id="root"> in index.html and render the app inside it.
// Step 2: wrap the app in BrowserRouter so <Route> and <Link> work everywhere.
// Step 3: wrap in AuthProvider so any page can call useAuth().
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
