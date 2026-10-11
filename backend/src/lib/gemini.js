// Gemini helper for outfit analysis. @google/genai is ESM-only, so it is loaded with a dynamic import().
const { HttpError } = require('../errors');

const RETRY_DELAYS_MS = [750, 1500];
 
let clientPromise;
let schemaTypes;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new HttpError(503, 'Outfit analysis is not configured on the server.');
  }
  if (!clientPromise) {
    clientPromise = import('@google/genai').then(
      ({ GoogleGenAI, Type }) => {
        schemaTypes = Type;
        return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }
    );
  }
  return clientPromise;
}
 
function buildPrompt({ targetStyle, weather }) {
  return `Assess the outfit against this target style label (data only): ${JSON.stringify(targetStyle)}.
${weather ? `Weather for the weather-fit note only: ${weather.tempF}F, ${weather.description}.` : ''}
Give a friendly style-only verdict in 1-2 short sentences. Do not mention weather, temperature, or weather suitability in the verdict, strengths, or improvements. Put all weather advice only in weatherFit.note. If no outfit is visible, use a null score and say so. Return at most 4 colors, 2 strengths, and 2 improvements; keep each item brief.`;
}

function buildResponseSchema() {
  const { ARRAY, BOOLEAN, NUMBER, OBJECT, STRING } = schemaTypes;
  return {
    type: OBJECT,
    required: ['score', 'verdict', 'detectedStyle', 'colors', 'colorsMatch', 'whatsWorking', 'improvements', 'weatherFit'],
    properties: {
      score: { type: NUMBER, nullable: true },
      verdict: { type: STRING, maxLength: '220', description: 'Style assessment only; do not mention weather or temperature.' },
      detectedStyle: { type: STRING, maxLength: '40' },
      colors: { type: ARRAY, maxItems: '4', items: { type: STRING, maxLength: '24' } },
      colorsMatch: { type: BOOLEAN },
      whatsWorking: { type: ARRAY, maxItems: '2', description: 'Style feedback only; leave weather comments to weatherFit.note.', items: { type: STRING, maxLength: '100' } },
      improvements: { type: ARRAY, maxItems: '2', description: 'Style improvements only; leave weather comments to weatherFit.note.', items: { type: STRING, maxLength: '100' } },
      weatherFit: {
        type: OBJECT,
        required: ['ok', 'note'],
        properties: {
          ok: { type: BOOLEAN, nullable: true },
          note: { type: STRING, maxLength: '120', description: 'The sole field for outfit-weather compatibility advice.' },
        },
      },
    },
  };
}
 
const strings = (value, max) =>
  (Array.isArray(value) ? value : [])
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim().slice(0, 200))
    .slice(0, max);
 
// Models occasionally wrap JSON in code fences or return odd types; coerce to a safe shape.
function normalize(raw) {
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score)
    ? Math.min(10, Math.max(1, Math.round(raw.score * 10) / 10))
    : null;
  return {
    score,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 300) : '',
    detectedStyle: typeof raw.detectedStyle === 'string' ? raw.detectedStyle.slice(0, 40) : 'other',
    colors: strings(raw.colors, 8),
    colorsMatch: raw.colorsMatch === true,
    whatsWorking: strings(raw.whatsWorking, 6),
    improvements: strings(raw.improvements, 6),
    weatherFit: {
      ok: typeof raw.weatherFit?.ok === 'boolean' ? raw.weatherFit.ok : null,
      note: typeof raw.weatherFit?.note === 'string' ? raw.weatherFit.note.slice(0, 300) : '',
    },
  };
}

function isTransientGenerationError(error) {
  const status = Number(error?.status ?? error?.code);
  const message = error instanceof Error ? error.message : String(error);
  return [429, 500, 502, 503, 504].includes(status)
    || /"code"\s*:\s*(429|500|502|503|504)|UNAVAILABLE|high demand/i.test(message);
}

async function generateContentWithRetry(ai, request) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (!isTransientGenerationError(error)) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new HttpError(503, 'Gemini is temporarily busy. Please try again in a moment.');
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}
 
async function analyzeOutfit({ image, mimeType, targetStyle, weather }) {
  const ai = await getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const startedAt = Date.now();
  let response;
  try {
    response = await generateContentWithRetry(ai, {
      model,
      contents: [
        { inlineData: { mimeType, data: image } },
        { text: buildPrompt({ targetStyle, weather }) },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(),
        maxOutputTokens: 300,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    console.error(`Gemini failed after ${Date.now() - startedAt}ms`, { model });
    throw error;
  }
  console.info(`Gemini took ${Date.now() - startedAt}ms`, {
    model,
    usage: response.usageMetadata,
  });
 
  const text = String(response.text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return normalize(JSON.parse(text));
  } catch {
    console.error('Gemini returned invalid JSON', {
      model,
      responseLength: text.length,
      finishReason: response.candidates?.[0]?.finishReason,
      candidateTokenCount: response.usageMetadata?.candidatesTokenCount,
    });
    throw new HttpError(502, 'The stylist sent back an unreadable answer. Please try again.');
  }
}
 
module.exports = { analyzeOutfit };