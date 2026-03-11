-- pg_cron scheduled cleanup for rate_limits table
--
-- PREREQUISITE: pg_cron must be enabled via the Supabase Dashboard
-- (Database → Extensions → pg_cron) before running this migration.
-- The migration will fail if pg_cron is not enabled.

-- Run cleanup_rate_limits() every 5 minutes to purge expired windows
SELECT cron.schedule(
  'cleanup-rate-limits',
  '*/5 * * * *',
  $$SELECT public.cleanup_rate_limits()$$
);

-- Purge cron.job_run_details older than 7 days, daily at 03:00 UTC
SELECT cron.schedule(
  'cleanup-cron-history',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
