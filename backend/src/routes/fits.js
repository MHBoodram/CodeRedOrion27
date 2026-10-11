const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Shape used by both GET /api/fits and the analyze response's saved row.
const toFit = (row) => ({
  id: row.id,
  score: row.score === null ? null : Number(row.score),
  targetStyle: row.target_style,
  verdict: row.result?.verdict || '',
  detectedStyle: row.result?.detectedStyle || '',
  thumbnail: row.thumbnail,
  createdAt: row.created_at,
  result: row.result,
});

// Signed-in user's analysis history, newest first.
router.get('/', requireAuth, validate(listQuery, 'query'), async (req, res) => {
  const { limit, offset } = req.valid;
  const { rows } = await db.query(
    `SELECT id, score, target_style, result, thumbnail, created_at
       FROM fit_analyses WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  res.json({ fits: rows.map(toFit), limit, offset });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM fit_analyses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Fit not found' });
  res.status(204).end();
});

module.exports = router;
module.exports.toFit = toFit;
