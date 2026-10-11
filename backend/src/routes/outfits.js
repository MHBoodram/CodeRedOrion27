const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const { HttpError, validate } = require('../errors');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const {
  VISIBLE, OUTFIT_SELECT, getOutfit, assertVisible, setItems, setTags, logEvent,
} = require('../lib/outfitQueries');

const VISIBILITY = ['public', 'followers', 'private'];

const itemIds = z.array(z.string().uuid()).min(1).max(20);
const tags = z
  .array(z.string())
  .max(10)
  .transform((arr) => [...new Set(arr.map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))])
  .refine((arr) => arr.every((t) => t.length <= 30), 'Tags must be 30 characters or fewer');

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  cover_image_url: z.string().url().optional(),
  occasion: z.string().trim().max(50).optional(),
  season: z.string().trim().max(50).optional(),
  visibility: z.enum(VISIBILITY).default('public'),
  item_ids: itemIds,
  tags: tags.default([]),
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000),
    cover_image_url: z.string().url(),
    occasion: z.string().trim().max(50),
    season: z.string().trim().max(50),
    visibility: z.enum(VISIBILITY),
    item_ids: itemIds,
    tags,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const listQuery = z.object({
  sort: z.enum(['recent', 'top', 'trending']).default('recent'),
  scope: z.enum(['all', 'following']).default('all'),
  tag: z.string().trim().toLowerCase().optional(),
  occasion: z.string().trim().optional(),
  season: z.string().trim().optional(),
  username: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const ratingSchema = z.object({ score: z.number().int().min(1).max(5) });
const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parent_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------- feed
// GET /api/outfits?sort=recent|top|trending&scope=all|following&tag=&occasion=&season=&username=&limit=&offset=
router.get('/', optionalAuth, validate(listQuery, 'query'), async (req, res) => {
  const q = req.valid;
  const params = [req.user?.id ?? null];
  const where = [VISIBLE];
  const add = (value) => { params.push(value); return `$${params.length}`; };

  if (q.scope === 'following') {
    if (!req.user) throw new HttpError(401, 'Authentication required for the following feed');
    where.push('o.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1::uuid)');
  }
  if (q.tag) {
    where.push(`EXISTS (SELECT 1 FROM outfit_tags ot JOIN tags t ON t.id = ot.tag_id
                        WHERE ot.outfit_id = o.id AND t.name = ${add(q.tag)})`);
  }
  if (q.occasion) where.push(`o.occasion ILIKE ${add(q.occasion)}`);
  if (q.season) where.push(`o.season ILIKE ${add(q.season)}`);
  if (q.username) where.push(`u.username = ${add(q.username)}`);
  if (q.sort === 'top') where.push('o.rating_count > 0');

  // Trending = most engagement events in the last 24h (reads the hypertable)
  const orderBy = {
    recent: 'o.created_at DESC',
    top: 'o.rating_avg DESC, o.rating_count DESC, o.created_at DESC',
    trending: `(SELECT COUNT(*) FROM outfit_events e
                WHERE e.outfit_id = o.id AND e.occurred_at > now() - INTERVAL '24 hours') DESC,
               o.created_at DESC`,
  }[q.sort];

  const limitP = add(q.limit);
  const offsetP = add(q.offset);
  const { rows } = await db.query(
    `${OUTFIT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ${limitP} OFFSET ${offsetP}`,
    params
  );
  res.json({ outfits: rows, limit: q.limit, offset: q.offset });
});

// ---------------------------------------------------------------- CRUD
router.post('/', requireAuth, validate(createSchema), async (req, res) => {
  const b = req.valid;
  const id = await db.withTx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO outfits (user_id, title, description, cover_image_url, occasion, season, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user.id, b.title, b.description, b.cover_image_url, b.occasion, b.season, b.visibility]
    );
    await setItems(c, rows[0].id, req.user.id, b.item_ids);
    await setTags(c, rows[0].id, b.tags);
    return rows[0].id;
  });
  res.status(201).json({ outfit: await getOutfit(id, req.user.id) });
});

router.get('/:id', optionalAuth, async (req, res) => {
  const outfit = await getOutfit(req.params.id, req.user?.id ?? null);
  if (!outfit) throw new HttpError(404, 'Outfit not found');
  if (outfit.author.id !== req.user?.id) logEvent(outfit.id, req.user?.id ?? null, 'view');
  res.json({ outfit });
});

router.patch('/:id', requireAuth, validate(patchSchema), async (req, res) => {
  const b = req.valid;
  await db.withTx(async (c) => {
    const { rows } = await c.query(
      `UPDATE outfits SET
         title = COALESCE($3, title), description = COALESCE($4, description),
         cover_image_url = COALESCE($5, cover_image_url), occasion = COALESCE($6, occasion),
         season = COALESCE($7, season), visibility = COALESCE($8::outfit_visibility, visibility)
       WHERE id = $1::uuid AND user_id = $2::uuid RETURNING id`,
      [req.params.id, req.user.id, b.title, b.description, b.cover_image_url, b.occasion, b.season, b.visibility]
    );
    if (!rows[0]) throw new HttpError(404, 'Outfit not found');
    if (b.item_ids) await setItems(c, req.params.id, req.user.id, b.item_ids);
    if (b.tags) await setTags(c, req.params.id, b.tags);
  });
  res.json({ outfit: await getOutfit(req.params.id, req.user.id) });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM outfits WHERE id = $1::uuid AND user_id = $2::uuid',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw new HttpError(404, 'Outfit not found');
  res.status(204).end();
});

// ---------------------------------------------------------------- ratings
router.put('/:id/rating', requireAuth, validate(ratingSchema), async (req, res) => {
  const { score } = req.valid;
  await assertVisible(req.params.id, req.user.id);
  try {
    await db.query(
      `INSERT INTO ratings (outfit_id, user_id, score) VALUES ($1::uuid, $2::uuid, $3)
       ON CONFLICT (outfit_id, user_id) DO UPDATE SET score = EXCLUDED.score`,
      [req.params.id, req.user.id, score]
    );
  } catch (err) {
    if (err.code === 'P0001') throw new HttpError(403, "You can't rate your own outfit");
    throw err;
  }
  logEvent(req.params.id, req.user.id, 'rating', score);
  const { rows } = await db.query(
    'SELECT rating_count, rating_avg::float8 AS rating_avg FROM outfits WHERE id = $1::uuid',
    [req.params.id]
  );
  res.json({ my_rating: score, ...rows[0] });
});

router.delete('/:id/rating', requireAuth, async (req, res) => {
  await db.query('DELETE FROM ratings WHERE outfit_id = $1::uuid AND user_id = $2::uuid', [
    req.params.id, req.user.id,
  ]);
  const { rows } = await db.query(
    'SELECT rating_count, rating_avg::float8 AS rating_avg FROM outfits WHERE id = $1::uuid',
    [req.params.id]
  );
  res.json({ my_rating: null, ...rows[0] });
});

// ---------------------------------------------------------------- comments
router.get('/:id/comments', optionalAuth, async (req, res) => {
  await assertVisible(req.params.id, req.user?.id ?? null);
  const { rows } = await db.query(
    `SELECT c.id, c.parent_id, c.body, c.created_at,
            json_build_object('id', u.id, 'username', u.username,
                              'display_name', u.display_name, 'avatar_url', u.avatar_url) AS author
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.outfit_id = $1::uuid ORDER BY c.created_at LIMIT 500`,
    [req.params.id]
  );
  res.json({ comments: rows }); // flat list; nest on the client using parent_id
});

router.post('/:id/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const { body, parent_id } = req.valid;
  await assertVisible(req.params.id, req.user.id);
  if (parent_id) {
    const { rows } = await db.query(
      'SELECT 1 FROM comments WHERE id = $1::uuid AND outfit_id = $2::uuid',
      [parent_id, req.params.id]
    );
    if (!rows[0]) throw new HttpError(400, 'Parent comment not found on this outfit');
  }
  const { rows } = await db.query(
    `INSERT INTO comments (outfit_id, user_id, parent_id, body)
     VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id, parent_id, body, created_at`,
    [req.params.id, req.user.id, parent_id || null, body]
  );
  logEvent(req.params.id, req.user.id, 'comment');
  res.status(201).json({ comment: rows[0] });
});

router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  // Allowed for the comment's author or the outfit's owner
  const { rowCount } = await db.query(
    `DELETE FROM comments c USING outfits o
     WHERE c.id = $1::uuid AND c.outfit_id = $2::uuid AND o.id = c.outfit_id
       AND (c.user_id = $3::uuid OR o.user_id = $3::uuid)`,
    [req.params.commentId, req.params.id, req.user.id]
  );
  if (!rowCount) throw new HttpError(404, 'Comment not found');
  res.status(204).end();
});

// ---------------------------------------------------------------- saves
router.post('/:id/save', requireAuth, async (req, res) => {
  await assertVisible(req.params.id, req.user.id);
  await db.query(
    `INSERT INTO saved_outfits (user_id, outfit_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.id]
  );
  logEvent(req.params.id, req.user.id, 'save');
  res.json({ saved: true });
});

router.delete('/:id/save', requireAuth, async (req, res) => {
  await db.query('DELETE FROM saved_outfits WHERE user_id = $1::uuid AND outfit_id = $2::uuid', [
    req.user.id, req.params.id,
  ]);
  res.json({ saved: false });
});

module.exports = router;
