-- pg_cron scheduled cleanup for rate_limits table
--
-- PREREQUISITE: pg_cron must be enabled via the Supabase Dashboard
-- (Database → Extensions → pg_cron) before running this migration.
-- On local dev (where pg_cron is not available), this migration is a no-op.

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Run cleanup_rate_limits() every 5 minutes to purge expired windows
    PERFORM cron.schedule(
      'cleanup-rate-limits',
      '*/5 * * * *',
      'SELECT public.cleanup_rate_limits()'
    );

    -- Purge cron.job_run_details older than 7 days, daily at 03:00 UTC
    PERFORM cron.schedule(
      'cleanup-cron-history',
      '0 3 * * *',
      $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping cron schedule setup';
  END IF;
END;
$outer$;
