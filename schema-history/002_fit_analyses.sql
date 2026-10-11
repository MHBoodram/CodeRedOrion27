-- Level 3: history of AI outfit analyses ("Past Fits").
-- Safe to re-run. Run with:  psql "$DATABASE_URL" -f schema-history/002_fit_analyses.sql
CREATE TABLE IF NOT EXISTS fit_analyses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score         NUMERIC(3,1),             -- 1.0-10.0 (NULL never stored: "no outfit" results are not saved)
    target_style  TEXT         NOT NULL,
    result        JSONB        NOT NULL,    -- full normalized Gemini answer
    thumbnail     TEXT,                     -- ~256px JPEG data URL, optional (demo storage)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT fit_analyses_score_range CHECK (score IS NULL OR (score >= 1 AND score <= 10))
);
CREATE INDEX IF NOT EXISTS idx_fit_analyses_user ON fit_analyses(user_id, created_at DESC);
