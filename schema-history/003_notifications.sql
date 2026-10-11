-- Level 9: notifications (someone rated, commented on, or followed you).
-- Safe to re-run. Run with:  psql "$DATABASE_URL" -f schema-history/003_notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- who receives it
    actor_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- who caused it
    type        TEXT        NOT NULL CHECK (type IN ('follow', 'rating', 'comment')),
    outfit_id   UUID        REFERENCES outfits(id) ON DELETE CASCADE,         -- NULL for follows
    detail      TEXT,                                                         -- rating score, or a short comment snippet
    read        BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_not_self CHECK (user_id <> actor_id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE NOT read;
