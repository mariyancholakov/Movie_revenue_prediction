-- Lock the tables down to the backend only.
--
-- Nothing but the Flask API (and its scheduled jobs) talks to Supabase; the
-- browser never does. So the right access model is: RLS on, no policies.
-- The anon/authenticated roles (publishable key) then see and change nothing,
-- while the API's secret key (service_role) bypasses RLS as usual.
--
-- ORDER MATTERS: switch the API's SUPABASE_KEY to the secret key (sb_secret_…)
-- BEFORE running this. With the publishable key still in place, every read and
-- write the API makes would start returning empty / failing.

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_gross ENABLE ROW LEVEL SECURITY;

-- Verify: both rows should show rowsecurity = true.
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN ('movies', 'weekly_gross');
