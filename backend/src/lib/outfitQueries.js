const db = require('../db');
const { HttpError } = require('../errors');

// Convention: $1 is ALWAYS the viewer's user id (or null for anonymous).
// Public outfits are visible to everyone, private to the owner only,
// followers-only to the owner and people who follow the owner.
const VISIBLE = `(
  o.visibility = 'public'
  OR o.user_id = $1::uuid
  OR (o.visibility = 'followers' AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = $1::uuid AND f.following_id = o.user_id))
)`;

const OUTFIT_SELECT = `
  SELECT o.id, o.title, o.description, o.cover_image_url, o.occasion, o.season, o.visibility,
         o.rating_count, o.rating_avg::float8 AS rating_avg, o.created_at, o.updated_at,
         json_build_object('id', u.id, 'username', u.username,
                           'display_name', u.display_name, 'avatar_url', u.avatar_url) AS author,
         COALESCE((SELECT json_agg(json_build_object(
                      'id', ci.id, 'name', ci.name, 'category', ci.category,
                      'brand', ci.brand, 'color', ci.color, 'image_url', ci.image_url) ORDER BY oi.position)
                   FROM outfit_items oi JOIN clothing_items ci ON ci.id = oi.clothing_item_id
                   WHERE oi.outfit_id = o.id), '[]'::json) AS items,
         COALESCE((SELECT json_agg(t.name ORDER BY t.name)
                   FROM outfit_tags ot JOIN tags t ON t.id = ot.tag_id
                   WHERE ot.outfit_id = o.id), '[]'::json) AS tags,
         (SELECT r.score FROM ratings r WHERE r.outfit_id = o.id AND r.user_id = $1::uuid) AS my_rating,
         EXISTS (SELECT 1 FROM saved_outfits s WHERE s.outfit_id = o.id AND s.user_id = $1::uuid) AS saved,
         EXISTS (SELECT 1 FROM follows fw WHERE fw.follower_id = $1::uuid AND fw.following_id = o.user_id) AS author_followed
  FROM outfits o
  JOIN users u ON u.id = o.user_id`;

async function getOutfit(id, viewerId) {
  const { rows } = await db.query(`${OUTFIT_SELECT} WHERE o.id = $2::uuid AND ${VISIBLE}`, [viewerId, id]);
  return rows[0] || null;
}

async function assertVisible(id, viewerId) {
  const { rows } = await db.query(
    `SELECT o.id, o.user_id FROM outfits o WHERE o.id = $2::uuid AND ${VISIBLE}`,
    [viewerId, id]
  );
  if (!rows[0]) throw new HttpError(404, 'Outfit not found');
  return rows[0];
}

// Replace the items of an outfit (all items must belong to the user)
async function setItems(client, outfitId, userId, itemIds) {
  const ids = [...new Set(itemIds)];
  const { rows } = await client.query(
    'SELECT id FROM clothing_items WHERE id = ANY($1::uuid[]) AND user_id = $2::uuid',
    [ids, userId]
  );
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'One or more items do not exist or do not belong to you');
  }
  await client.query('DELETE FROM outfit_items WHERE outfit_id = $1::uuid', [outfitId]);
  await client.query(
    `INSERT INTO outfit_items (outfit_id, clothing_item_id, position)
     SELECT $1::uuid, t.id, (t.ord - 1)::smallint
     FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, ord)`,
    [outfitId, ids]
  );
}

// Replace the tags of an outfit (creating tags as needed)
async function setTags(client, outfitId, tags) {
  await client.query('DELETE FROM outfit_tags WHERE outfit_id = $1::uuid', [outfitId]);
  for (const name of tags) {
    const { rows } = await client.query(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name]
    );
    await client.query(
      'INSERT INTO outfit_tags (outfit_id, tag_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING',
      [outfitId, rows[0].id]
    );
  }
}

// Fire-and-forget write to the outfit_events hypertable
function logEvent(outfitId, userId, event, value = null) {
  db.query(
    'INSERT INTO outfit_events (outfit_id, user_id, event, value) VALUES ($1, $2, $3, $4)',
    [outfitId, userId, event, value]
  ).catch((e) => console.error('event log failed:', e.message));
}

module.exports = { VISIBLE, OUTFIT_SELECT, getOutfit, assertVisible, setItems, setTags, logEvent };
