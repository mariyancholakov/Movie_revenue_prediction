-- Feedback-loop columns for the "learn from finished runs" pipeline.
-- All nullable / additive, so existing queries and the live cache are unaffected.

-- Prediction-time snapshot of the exact 26-feature row fed to the model.
-- Kept so retraining uses the features as they were at predict time
-- (popularity etc. drift after release), not a rebuilt approximation.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS features jsonb;

-- Ground-truth total revenue captured once a run ends. Sourced from TMDB's
-- `revenue` field to match the unit of the model's training label
-- (worldwide total) — NOT the domestic weekend sum in weekly_gross.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS actual_revenue bigint;

-- When the run was detected as finished and the label captured.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS finished_at timestamptz;
