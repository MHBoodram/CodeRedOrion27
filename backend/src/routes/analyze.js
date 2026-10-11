const express = require('express');
const { z } = require('zod');
const { HttpError, validate } = require('../errors');
const { requireAuth } = require('../middleware/auth');
const { analyzeOutfit } = require('../lib/gemini');
 
const router = express.Router();
 
// Per-user limit (in memory: resets on restart and is per instance on serverless).
// Swap for a shared store (e.g. Redis or a DB table) if you need a hard guarantee.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map();
 
function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.user.id) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return next(new HttpError(429, 'Too many analyses. Please try again in a few minutes.'));
  }
  recent.push(now);
  hits.set(req.user.id, recent);
  next();
}
 
const analyzeSchema = z.object({
  // Accept raw base64 or a full data URL; the prefix is stripped.
  image: z.string().transform((s) => s.replace(/^data:[^;]+;base64,/, '')).pipe(z.string().min(100).max(5_000_000)),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  targetStyle: z.string().trim().min(1, 'Describe the style you are aiming for.').max(300),
  weather: z
    .object({
      tempF: z.number().min(-60).max(150),
      description: z.string().trim().max(60),
    })
    .optional(),
});
 
// requireAuth runs first so unauthenticated callers never get their body parsed.
// This route is mounted BEFORE the global 1 MB JSON parser in server.js and sets its own larger limit.
router.post('/', requireAuth, express.json({ limit: '6mb' }), rateLimit, validate(analyzeSchema), async (req, res) => {
  try {
    res.json(await analyzeOutfit(req.valid));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('Outfit analysis failed:', err);
    throw new HttpError(
      502,
      process.env.NODE_ENV === 'production'
        ? 'Could not analyze this outfit. Please try again.'
        : `Gemini analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
});
 
module.exports = router;