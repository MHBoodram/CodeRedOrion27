const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { HttpError, validate } = require('../errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const toNotification = (r) => ({
  id: r.id,
  type: r.type, // 'follow' | 'rating' | 'comment'
  detail: r.detail,
  read: r.read,
  createdAt: r.created_at,
  actor: { id: r.actor_id, username: r.actor_username, displayName: r.actor_display_name, avatarUrl: r.actor_avatar_url },
  outfit: r.outfit_id ? { id: r.outfit_id, title: r.outfit_title } : null,
});

// Newest first, plus the total unread count for the bell badge.
router.get('/', requireAuth, validate(listQuery, 'query'), async (req, res) => {
  const { limit, offset } = req.valid;
  const [list, unread] = await Promise.all([
    db.query(
      `SELECT n.id, n.type, n.detail, n.read, n.created_at, n.actor_id, n.outfit_id,
              u.username AS actor_username, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url,
              o.title AS outfit_title
         FROM notifications n
         JOIN users u ON u.id = n.actor_id
         LEFT JOIN outfits o ON o.id = n.outfit_id
        WHERE n.user_id = $1::uuid
        ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    ),
    db.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1::uuid AND NOT read', [req.user.id]),
  ]);
  res.json({ notifications: list.rows.map(toNotification), unreadCount: unread.rows[0].n, limit, offset });
});

// Declared before /:id/read so "read-all" is never treated as an id.
router.post('/read-all', requireAuth, async (req, res) => {
  const { rowCount } = await db.query(
    'UPDATE notifications SET read = true WHERE user_id = $1::uuid AND NOT read',
    [req.user.id]
  );
  res.json({ updated: rowCount, unreadCount: 0 });
});

router.post('/:id/read', requireAuth, async (req, res) => {
  const { rowCount } = await db.query(
    'UPDATE notifications SET read = true WHERE id = $1::uuid AND user_id = $2::uuid',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw new HttpError(404, 'Notification not found');
  res.json({ read: true });
});

module.exports = router;
