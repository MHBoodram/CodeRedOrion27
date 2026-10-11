-- =====================================================================
-- Outfit Rating / Creation App: PostgreSQL + TigerData (TimescaleDB)
-- =====================================================================
-- Run with:  psql "<your tiger connection string>" -f schema.sql
-- NOTE: Do NOT wrap this whole file in BEGIN/COMMIT. Continuous
-- aggregates cannot be created inside a transaction block.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email/username

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE outfit_visibility AS ENUM ('public', 'followers', 'private');
CREATE TYPE item_category     AS ENUM
  ('top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'bag', 'headwear', 'other');
CREATE TYPE event_type        AS ENUM ('view', 'rating', 'comment', 'save', 'share');

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        CITEXT      NOT NULL UNIQUE,
    email           CITEXT      NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,            -- bcrypt/argon2 hash, never plaintext
    display_name    TEXT,
    avatar_url      TEXT,
    bio             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT username_format CHECK (username ~ '^[A-Za-z0-9_]{3,30}$')
);

-- ---------------------------------------------------------------------
-- WARDROBE: individual clothing items a user owns / uploads
-- ---------------------------------------------------------------------
CREATE TABLE clothing_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT          NOT NULL,
    category    item_category NOT NULL,
    brand       TEXT,
    color       TEXT,
    image_url   TEXT,
    purchase_url TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_clothing_items_user ON clothing_items(user_id, category);

-- ---------------------------------------------------------------------
-- OUTFITS
-- ---------------------------------------------------------------------
CREATE TABLE outfits (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT              NOT NULL,
    description   TEXT,
    cover_image_url TEXT,
    occasion      TEXT,                              -- e.g. 'casual', 'work', 'date night'
    season        TEXT,                              -- e.g. 'summer', 'winter'
    visibility    outfit_visibility NOT NULL DEFAULT 'public',

    -- Denormalized rating stats (maintained by trigger below)
    rating_count  INTEGER           NOT NULL DEFAULT 0,
    rating_sum    INTEGER           NOT NULL DEFAULT 0,
    rating_avg    NUMERIC(3,2)      NOT NULL DEFAULT 0,

    created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_outfits_user        ON outfits(user_id, created_at DESC);
CREATE INDEX idx_outfits_feed        ON outfits(created_at DESC) WHERE visibility = 'public';
CREATE INDEX idx_outfits_top_rated   ON outfits(rating_avg DESC, rating_count DESC) WHERE visibility = 'public';

-- Which clothing items make up an outfit
CREATE TABLE outfit_items (
    outfit_id        UUID    NOT NULL REFERENCES outfits(id)        ON DELETE CASCADE,
    clothing_item_id UUID    NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
    position         SMALLINT NOT NULL DEFAULT 0,    -- display order
    PRIMARY KEY (outfit_id, clothing_item_id)
);
CREATE INDEX idx_outfit_items_item ON outfit_items(clothing_item_id);

-- ---------------------------------------------------------------------
-- TAGS
-- ---------------------------------------------------------------------
CREATE TABLE tags (
    id    SERIAL PRIMARY KEY,
    name  CITEXT NOT NULL UNIQUE
);

CREATE TABLE outfit_tags (
    outfit_id UUID    NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (outfit_id, tag_id)
);
CREATE INDEX idx_outfit_tags_tag ON outfit_tags(tag_id);

-- ---------------------------------------------------------------------
-- RATINGS: one rating per user per outfit
-- ---------------------------------------------------------------------
CREATE TABLE ratings (
    outfit_id  UUID        NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    score      SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (outfit_id, user_id)
);
CREATE INDEX idx_ratings_user ON ratings(user_id);

-- ---------------------------------------------------------------------
-- COMMENTS (supports threaded replies)
-- ---------------------------------------------------------------------
CREATE TABLE comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outfit_id  UUID        NOT NULL REFERENCES outfits(id)  ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    parent_id  UUID        REFERENCES comments(id)          ON DELETE CASCADE,
    body       TEXT        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_outfit ON comments(outfit_id, created_at);

-- ---------------------------------------------------------------------
-- SOCIAL: saved outfits + follows
-- ---------------------------------------------------------------------
CREATE TABLE saved_outfits (
    user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    outfit_id  UUID        NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, outfit_id)
);

CREATE TABLE follows (
    follower_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id)
);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ---------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------

-- Generic updated_at maintenance
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clothing_items_updated BEFORE UPDATE ON clothing_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_outfits_updated        BEFORE UPDATE ON outfits        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ratings_updated        BEFORE UPDATE ON ratings        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_comments_updated       BEFORE UPDATE ON comments       FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Prevent users from rating their own outfits
CREATE OR REPLACE FUNCTION prevent_self_rating() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM outfits WHERE id = NEW.outfit_id AND user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'Users cannot rate their own outfits';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ratings_no_self
    BEFORE INSERT ON ratings
    FOR EACH ROW EXECUTE FUNCTION prevent_self_rating();

-- Keep outfits.rating_* in sync with the ratings table
CREATE OR REPLACE FUNCTION refresh_outfit_rating() RETURNS trigger AS $$
DECLARE
    target UUID := COALESCE(NEW.outfit_id, OLD.outfit_id);
BEGIN
    UPDATE outfits o
    SET rating_count = s.cnt,
        rating_sum   = s.total,
        rating_avg   = CASE WHEN s.cnt = 0 THEN 0 ELSE ROUND(s.total::numeric / s.cnt, 2) END
    FROM (
        SELECT COUNT(*) AS cnt, COALESCE(SUM(score), 0) AS total
        FROM ratings WHERE outfit_id = target
    ) s
    WHERE o.id = target;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ratings_refresh
    AFTER INSERT OR UPDATE OR DELETE ON ratings
    FOR EACH ROW EXECUTE FUNCTION refresh_outfit_rating();

-- ---------------------------------------------------------------------
-- TIME-SERIES: engagement events (TigerData hypertable)
-- Log views/ratings/comments/etc. from your Node API for analytics
-- and "trending" calculations.
-- ---------------------------------------------------------------------
CREATE TABLE outfit_events (
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    outfit_id   UUID        NOT NULL,                -- no FK: hypertables + FKs to
    user_id     UUID,                                -- high-churn tables are costly;
    event       event_type  NOT NULL,                -- null user_id = anonymous view
    value       SMALLINT                              -- e.g. the score for 'rating'
);

SELECT create_hypertable('outfit_events', 'occurred_at', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_outfit_events_outfit ON outfit_events(outfit_id, occurred_at DESC);

-- Hourly rollup per outfit and event type
CREATE MATERIALIZED VIEW outfit_events_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 hour', occurred_at) AS bucket,
    outfit_id,
    event,
    COUNT(*) AS event_count
FROM outfit_events
GROUP BY bucket, outfit_id, event
WITH NO DATA;

SELECT add_continuous_aggregate_policy('outfit_events_hourly',
    start_offset      => INTERVAL '3 hours',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes');

-- Compress raw events older than 30 days; drop after 1 year
ALTER TABLE outfit_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'outfit_id',
    timescaledb.compress_orderby   = 'occurred_at DESC'
);
SELECT add_compression_policy('outfit_events', INTERVAL '30 days');
SELECT add_retention_policy('outfit_events',   INTERVAL '365 days');

-- =====================================================================
-- Example: trending outfits over the last 24 hours
-- =====================================================================
-- SELECT o.id, o.title, SUM(h.event_count) AS activity
-- FROM outfit_events_hourly h
-- JOIN outfits o ON o.id = h.outfit_id
-- WHERE h.bucket > now() - INTERVAL '24 hours'
--   AND o.visibility = 'public'
-- GROUP BY o.id, o.title
-- ORDER BY activity DESC
-- LIMIT 20;
