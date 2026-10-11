import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured in gemini-service/.env.");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Step 2: the instructions. Asking for strict JSON means React can use the answer directly.
function buildPrompt({ targetStyle, weather }) {
  return `You are a friendly, honest fashion stylist. Look at the outfit in the photo.
If there is no outfit or person visible, set "score" to null and explain in "verdict".
${targetStyle ? `The person is aiming for this style: ${targetStyle}.` : ""}
${weather ? `Current weather: ${weather.tempF}F, ${weather.description}.` : ""}

Reply with ONLY JSON in this exact shape:
{
  "score": number from 1 to 10 or null,
  "verdict": "one short, fun sentence",
<<<<<<< HEAD
  "detectedStyle": "streetwear | techwear | academia | gothic | business casual | business professional | smart | other",
  "colors": ["main colors you see"],
=======
  "fitGiving": {
    "vibe": "a short description of what the outfit is giving",
    "closestStyle": "the existing style category most similar to this outfit",
    "reason": "one short reason for the style match"
  },
  "colors": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"],
>>>>>>> f013c8724235d03b73a7965efc685ee608758a57
  "colorsMatch": true or false,
  "whatsWorking": ["short bullet"],
  "improvements": ["short bullet"],
  "weatherFit": { "ok": true or false or null if no weather given, "note": "short note" }
}`;
}

// Step 3: send the photo + instructions to Gemini, then parse its JSON reply.
export async function analyzeOutfit({ image, mimeType, targetStyle, weather }) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { mimeType: mimeType || "image/jpeg", data: image } }, // the photo (base64 text)
      { text: buildPrompt({ targetStyle, weather }) },                      // the instructions
    ],
    config: { responseMimeType: "application/json" }, // ask Gemini for raw JSON
  });
  return JSON.parse(response.text);
}