-- Push notifications for saved films. One row per (browser, film): the
-- browser's push address and keys, the film's title for the message, and
-- where the film stood when we last told that browser (last_state), so the
-- scheduled job only sends when something meaningful has changed since.
--
-- Run this in the Supabase dashboard SQL editor (see migrations/002 for why).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint   text        NOT NULL,
  tmdb_id    integer     NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  title      text        NOT NULL,
  last_state jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, tmdb_id)
);

-- Backend only, like the other tables: RLS on, no policies.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
