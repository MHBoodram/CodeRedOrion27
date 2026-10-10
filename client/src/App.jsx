import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/home" element={<h1>Home (coming soon)</h1>} />
      <Route path="/analyze" element={<h1>Analyze (coming soon)</h1>} />
    </Routes>
  );
}
