const db = require('../db');

// Creates a notification for `userId`, caused by `actorId`. Never throws: a failed notification must
// never break the rating/comment/follow that triggered it (for example if migration 003 isn't applied yet).
// Re-rating or re-following replaces the earlier unread notification instead of piling up duplicates.
async function notify({ userId, actorId, type, outfitId = null, detail = null }) {
  if (!userId || !actorId || userId === actorId) return;
  try {
    if (type === 'rating' || type === 'follow') {
      await db.query(
        `DELETE FROM notifications
          WHERE user_id = $1::uuid AND actor_id = $2::uuid AND type = $3
            AND outfit_id IS NOT DISTINCT FROM $4::uuid AND NOT read`,
        [userId, actorId, type, outfitId]
      );
    }
    await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, outfit_id, detail)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
      [userId, actorId, type, outfitId, detail]
    );
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

module.exports = { notify };
