const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const { HttpError, validate } = require('../errors');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { VISIBLE, OUTFIT_SELECT } = require('../lib/outfitQueries');
const { notify } = require('../lib/notify');

const patchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(60),
    bio: z.string().trim().max(300),
    avatar_url: z.string().url(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// NOTE: /me routes must be declared before /:username

router.patch('/me', requireAuth, validate(patchSchema), async (req, res) => {
  const b = req.valid;
  const { rows } = await db.query(
    `UPDATE users SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio),
            avatar_url = COALESCE($4, avatar_url)
     WHERE id = $1 RETURNING id, username, email, display_name, avatar_url, bio, created_at`,
    [req.user.id, b.display_name, b.bio, b.avatar_url]
  );
  res.json({ user: rows[0] });
});

// Outfits the current user has saved
router.get('/me/saved', requireAuth, validate(pageQuery, 'query'), async (req, res) => {
  const { limit, offset } = req.valid;
  const { rows } = await db.query(
    `${OUTFIT_SELECT}
     JOIN saved_outfits so ON so.outfit_id = o.id AND so.user_id = $1::uuid
     WHERE ${VISIBLE}
     ORDER BY so.created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  res.json({ outfits: rows, limit, offset });
});

// Public profile. For their outfits use GET /api/outfits?username=<name>
router.get('/:username', optionalAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.created_at,
            (SELECT COUNT(*) FROM outfits o WHERE o.user_id = u.id AND o.visibility = 'public')::int AS outfit_count,
            (SELECT COUNT(*) FROM follows WHERE following_id = u.id)::int AS follower_count,
            (SELECT COUNT(*) FROM follows WHERE follower_id = u.id)::int AS following_count,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = u.id) AS is_following
     FROM users u WHERE u.username = $2`,
    [req.user?.id ?? null, req.params.username]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json({ user: rows[0] });
});

router.post('/:username/follow', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  if (rows[0].id === req.user.id) throw new HttpError(400, "You can't follow yourself");
  const inserted = await db.query(
    'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, rows[0].id]
  );
  if (inserted.rowCount) await notify({ userId: rows[0].id, actorId: req.user.id, type: 'follow' });
  res.json({ following: true });
});

router.delete('/:username/follow', requireAuth, async (req, res) => {
  await db.query(
    `DELETE FROM follows WHERE follower_id = $1
       AND following_id = (SELECT id FROM users WHERE username = $2)`,
    [req.user.id, req.params.username]
  );
  res.json({ following: false });
});

module.exports = router;
