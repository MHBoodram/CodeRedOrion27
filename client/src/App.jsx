import { Link, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing.jsx";

export default function App() {
  return (
    <>
      {/* Step 1: a temporary nav so you can click between pages */}
      <nav>
        <Link to="/">Landing</Link> | <Link to="/home">Home</Link> | <Link to="/analyze">Analyze</Link>
      </nav>

      {/* Step 2: pick the page that matches the URL */}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/home" element={<h1>Home (coming soon)</h1>} />
        <Route path="/analyze" element={<h1>Analyze (coming soon)</h1>} />
      </Routes>
    </>
  );
}
