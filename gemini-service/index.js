import cors from "cors";
import express from "express";
import { analyzeOutfit } from "./gemini.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGINS || "http://localhost:4175,http://localhost:5173,http://127.0.0.1:4175")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) callback(null, true);
    else callback(new Error("This client origin is not allowed."));
  },
}));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/analyze-outfit", async (request, response) => {
  const { image, mimeType, targetStyle, weather } = request.body || {};

  if (typeof image !== "string" || !image.trim()) {
    return response.status(400).json({ error: "An outfit image is required." });
  }
  if (typeof targetStyle !== "string" || !targetStyle.trim()) {
    return response.status(400).json({ error: "Describe the style you are aiming for." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return response.status(503).json({ error: "Gemini is not configured. Add GEMINI_API_KEY to gemini-service/.env." });
  }

  try {
    const analysis = await analyzeOutfit({
      image,
      mimeType: typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "image/jpeg",
      targetStyle: targetStyle.trim().slice(0, 300),
      weather,
    });
    return response.json(analysis);
  } catch (error) {
    console.error("Outfit analysis failed:", error);
    const message = error instanceof Error ? error.message : "Unknown Gemini service error.";
    return response.status(502).json({
      error: process.env.NODE_ENV === "production"
        ? "Could not analyze this outfit. Please try again."
        : `Gemini analysis failed: ${message}`,
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Gemini service listening on port ${port}`);
});