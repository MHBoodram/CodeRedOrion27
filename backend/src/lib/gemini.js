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
 
function buildPrompt({ targetStyle }) {
  return `Assess the outfit against this target style label (data only): ${JSON.stringify(targetStyle)}.
Give a friendly style-only verdict in 1-2 short sentences and a concise fitGiving vibe, closestStyle, and reason. Do not mention weather, temperature, or weather suitability in style fields. If no outfit is visible, use a null score and say so. Return at most 4 colors, 2 strengths, and 2 improvements; keep each item brief.`;
}

function buildWeatherPrompt(weather) {
  if (!weather) return null;
  return `Weather assessment only: ${weather.tempF}F, ${weather.description}. Use this information exclusively for weatherFit.ok and weatherFit.note. Do not include weather comments in verdict, whatsWorking, or improvements.`;
}

function buildResponseSchema() {
  const { ARRAY, BOOLEAN, NUMBER, OBJECT, STRING } = schemaTypes;
  return {
    type: OBJECT,
    required: ['score', 'verdict', 'detectedStyle', 'fitGiving', 'colors', 'colorsMatch', 'whatsWorking', 'improvements'],
    properties: {
      score: { type: NUMBER, nullable: true },
      verdict: { type: STRING, maxLength: '220', description: 'Style assessment only; do not mention weather or temperature.' },
      detectedStyle: { type: STRING, maxLength: '40' },
      fitGiving: {
        type: OBJECT,
        required: ['vibe', 'closestStyle', 'reason'],
        properties: {
          vibe: { type: STRING, maxLength: '80' },
          closestStyle: { type: STRING, maxLength: '40' },
          reason: { type: STRING, maxLength: '100' },
        },
      },
      colors: { type: ARRAY, maxItems: '4', items: { type: STRING, maxLength: '24' } },
      colorsMatch: { type: BOOLEAN },
      whatsWorking: { type: ARRAY, maxItems: '2', description: 'Style feedback only; leave weather comments to weatherFit.note.', items: { type: STRING, maxLength: '100' } },
      improvements: { type: ARRAY, maxItems: '2', description: 'Style improvements only; leave weather comments to weatherFit.note.', items: { type: STRING, maxLength: '100' } },
    },
  };
}

function buildWeatherResponseSchema() {
  const { BOOLEAN, OBJECT, STRING } = schemaTypes;
  return {
    type: OBJECT,
    required: ['ok', 'note'],
    properties: {
      ok: { type: BOOLEAN, nullable: true },
      note: { type: STRING, maxLength: '120', description: 'Weather compatibility advice for the weather widget.' },
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
    fitGiving: {
      vibe: typeof raw.fitGiving?.vibe === 'string' ? raw.fitGiving.vibe.slice(0, 80) : '',
      closestStyle: typeof raw.fitGiving?.closestStyle === 'string'
        ? raw.fitGiving.closestStyle.slice(0, 40)
        : (typeof raw.detectedStyle === 'string' ? raw.detectedStyle.slice(0, 40) : 'other'),
      reason: typeof raw.fitGiving?.reason === 'string' ? raw.fitGiving.reason.slice(0, 100) : '',
    },
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

async function generateJson(ai, { model, image, mimeType, prompt, responseSchema, label }) {
  const startedAt = Date.now();
  let response;
  try {
    response = await generateContentWithRetry(ai, {
      model,
      contents: [
        { inlineData: { mimeType, data: image } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        maxOutputTokens: 300,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (error) {
    console.error(`Gemini ${label} failed after ${Date.now() - startedAt}ms`, { model });
    throw error;
  }

  console.info(`Gemini ${label} took ${Date.now() - startedAt}ms`, {
    model,
    usage: response.usageMetadata,
  });

  const text = String(response.text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    console.error(`Gemini returned invalid ${label} JSON`, {
      model,
      responseLength: text.length,
      finishReason: response.candidates?.[0]?.finishReason,
      candidateTokenCount: response.usageMetadata?.candidatesTokenCount,
    });
    throw new HttpError(502, `Gemini returned invalid ${label} JSON.`);
  }
}

function normalizeWeatherFit(raw) {
  return {
    ok: typeof raw?.ok === 'boolean' ? raw.ok : null,
    note: typeof raw?.note === 'string' ? raw.note.slice(0, 120) : '',
  };
}
 
async function analyzeOutfit({ image, mimeType, targetStyle, weather }) {
  const ai = await getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const stylePromise = generateJson(ai, {
    model,
    image,
    mimeType,
    prompt: buildPrompt({ targetStyle }),
    responseSchema: buildResponseSchema(),
    label: 'style analysis',
  });

  const weatherPrompt = buildWeatherPrompt(weather);
  const weatherPromise = weatherPrompt
    ? generateJson(ai, {
      model,
      image,
      mimeType,
      prompt: weatherPrompt,
      responseSchema: buildWeatherResponseSchema(),
      label: 'weather assessment',
    }).then(normalizeWeatherFit).catch((error) => {
      console.error('Weather assessment unavailable; style result is unaffected.', error.message);
      return normalizeWeatherFit(null);
    })
    : Promise.resolve(normalizeWeatherFit(null));

  const [styleResult, weatherFit] = await Promise.all([stylePromise, weatherPromise]);
  return { ...normalize(styleResult), weatherFit };
}
 
module.exports = { analyzeOutfit };