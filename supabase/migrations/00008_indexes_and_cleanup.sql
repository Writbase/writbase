-- Add missing indexes for performance (G8)
CREATE INDEX IF NOT EXISTS idx_event_log_actor_id ON event_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_agent_permissions_project_dept ON agent_permissions (project_id, department_id);

-- RPC function for rate_limits cleanup (G7)
-- Call via pg_cron: SELECT cleanup_rate_limits();
-- Recommended schedule: every 15 minutes
-- Deletes rate_limit windows older than 5 minutes (well past the 1-minute window)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE window_start < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;
