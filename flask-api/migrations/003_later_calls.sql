-- The Ledger's later calls: a settled film's forecast after US weekends 2, 4
-- and 8, as {"2": dollars, "4": dollars, "8": dollars} for the weekends its
-- run reached. Stored when the film settles, like predicted_revenue (the
-- opening call), because re-scoring them on read would use a model retrained
-- on that very film. Nullable and additive.
ALTER TABLE movies ADD COLUMN IF NOT EXISTS later_calls jsonb;
