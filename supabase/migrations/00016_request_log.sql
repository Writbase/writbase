-- Request log for operational telemetry.
-- Separate from event_log (domain audit/provenance) — different shape and lifecycle.

CREATE TABLE request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key_id uuid NOT NULL REFERENCES agent_keys(id),
  tool_name text NOT NULL,
  project_id uuid REFERENCES projects(id),
  latency_ms int,
  status text NOT NULL,
  error_code text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_request_log" ON request_log
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- BRIN index for time-range scans (append-only, monotonic timestamps)
CREATE INDEX idx_request_log_created_at ON request_log USING brin (created_at);
CREATE INDEX idx_request_log_agent_key_id ON request_log (agent_key_id);

-- Partial index for error investigation only
CREATE INDEX idx_request_log_errors ON request_log (created_at, error_code)
  WHERE status != 'ok';

-- pg_cron cleanup: purge entries older than 30 days, daily at 04:00 UTC (no-op if pg_cron not available)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'cleanup-request-log',
      '0 4 * * *',
      $$DELETE FROM request_log WHERE created_at < now() - interval '30 days'$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping request log cleanup schedule';
  END IF;
END;
$outer$;
