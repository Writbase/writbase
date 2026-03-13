-- Production automation: 6 pg_cron jobs for operational hygiene
--
-- 1. Auto-archive stale completed tasks (daily)
-- 2. Deactivate unused agent keys (weekly)
-- 3. Event log rotation (daily)
-- 4. Webhook delivery retries + dead-letter cleanup (every 2 min + daily)
-- 5. Usage metrics aggregation (daily)
-- 6. ANALYZE hot tables (daily)
--
-- All jobs are gated on pg_cron availability (no-op on local dev).

-- ══════════════════════════════════════════════════════════════════════
-- 1. Auto-archive: mark completed/cancelled/failed tasks as archived
--    after 30 days of inactivity
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_archive_stale_tasks()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE tasks
  SET is_archived = true, updated_at = now()
  WHERE status IN ('done', 'cancelled', 'failed')
    AND is_archived = false
    AND updated_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Inactive key detection: deactivate keys unused for 90+ days
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION deactivate_stale_agent_keys()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE agent_keys
  SET is_active = false
  WHERE is_active = true
    AND last_used_at IS NOT NULL
    AND last_used_at < now() - interval '90 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Event log rotation: delete entries older than 90 days
-- ══════════════════════════════════════════════════════════════════════

-- The event_log trigger (prevent_event_log_mutation) fires unconditionally
-- on UPDATE/DELETE — SECURITY DEFINER does NOT bypass triggers. We add a
-- session variable check so the cleanup function can bypass it safely.

CREATE OR REPLACE FUNCTION prevent_event_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  -- Allow cleanup jobs to bypass via session variable
  IF current_setting('app.allow_event_log_cleanup', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'event_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_event_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Set bypass flag for the append-only trigger
  PERFORM set_config('app.allow_event_log_cleanup', 'true', true);

  DELETE FROM event_log
  WHERE created_at < now() - interval '90 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reset bypass flag
  PERFORM set_config('app.allow_event_log_cleanup', 'false', true);
  RETURN v_count;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Webhook delivery log + retry infrastructure
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wdl_pending_retry
  ON webhook_delivery_log (next_retry_at)
  WHERE status = 'pending' OR status = 'failed';

CREATE INDEX idx_wdl_subscription
  ON webhook_delivery_log (subscription_id, created_at DESC);

CREATE INDEX idx_wdl_task
  ON webhook_delivery_log (task_id);

-- Retry function: exponential backoff (2^attempts minutes, max 6 attempts)
-- After 6 failed attempts → mark as 'dead'
CREATE OR REPLACE FUNCTION process_webhook_retries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_dead integer := 0;
  v_stuck integer := 0;
BEGIN
  -- Promote stuck pending rows (attempted but no update in 10 min) to failed
  UPDATE webhook_delivery_log
  SET status = 'failed'
  WHERE status = 'pending'
    AND attempts > 0
    AND last_attempt_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_stuck = ROW_COUNT;

  -- Mark deliveries that exceeded max attempts as dead
  UPDATE webhook_delivery_log
  SET status = 'dead'
  WHERE status = 'failed'
    AND attempts >= 6;
  GET DIAGNOSTICS v_dead = ROW_COUNT;

  -- Reset eligible failed deliveries back to pending for retry
  UPDATE webhook_delivery_log
  SET status = 'pending',
      next_retry_at = now() + (power(2, attempts) || ' minutes')::interval
  WHERE status = 'failed'
    AND attempts < 6
    AND next_retry_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_stuck + v_dead + v_count;
END;
$$;

-- Dead-letter cleanup: purge dead entries older than 30 days
CREATE OR REPLACE FUNCTION cleanup_dead_webhooks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dead integer;
  v_delivered integer;
BEGIN
  DELETE FROM webhook_delivery_log
  WHERE status = 'dead'
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_dead = ROW_COUNT;

  -- Also purge delivered entries older than 7 days (no longer needed)
  DELETE FROM webhook_delivery_log
  WHERE status = 'delivered'
    AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_delivered = ROW_COUNT;

  RETURN v_dead + v_delivered;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. Usage metrics aggregation (for billing/quota enforcement)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workspace_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  tasks_created integer NOT NULL DEFAULT 0,
  tasks_active integer NOT NULL DEFAULT 0,
  api_requests integer NOT NULL DEFAULT 0,
  agent_keys_active integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period_start)
);

CREATE INDEX idx_workspace_usage_lookup
  ON workspace_usage (workspace_id, period_start DESC);

CREATE OR REPLACE FUNCTION aggregate_workspace_usage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_count integer;
BEGIN
  -- Current calendar month
  v_period_start := date_trunc('month', now())::date;
  v_period_end := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date;

  INSERT INTO workspace_usage (workspace_id, period_start, period_end,
    tasks_created, tasks_active, api_requests, agent_keys_active, computed_at)
  SELECT
    w.id,
    v_period_start,
    v_period_end,
    COALESCE(tc.cnt, 0),
    COALESCE(ta.cnt, 0),
    COALESCE(rl.cnt, 0),
    COALESCE(ak.cnt, 0),
    now()
  FROM workspaces w
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM tasks
    WHERE workspace_id = w.id
      AND created_at >= v_period_start
      AND created_at < v_period_end + interval '1 day'
  ) tc ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM tasks
    WHERE workspace_id = w.id
      AND is_archived = false
  ) ta ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM request_log
    WHERE workspace_id = w.id
      AND created_at >= v_period_start
      AND created_at < v_period_end + interval '1 day'
  ) rl ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM agent_keys
    WHERE workspace_id = w.id
      AND is_active = true
  ) ak ON true
  ON CONFLICT (workspace_id, period_start)
  DO UPDATE SET
    tasks_created = EXCLUDED.tasks_created,
    tasks_active = EXCLUDED.tasks_active,
    api_requests = EXCLUDED.api_requests,
    agent_keys_active = EXCLUDED.agent_keys_active,
    computed_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Schedule all jobs via pg_cron
-- ══════════════════════════════════════════════════════════════════════

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN

    -- 1. Auto-archive stale tasks: daily at 02:00 UTC
    PERFORM cron.schedule(
      'auto-archive-stale-tasks',
      '0 2 * * *',
      'SELECT public.auto_archive_stale_tasks()'
    );

    -- 2. Deactivate stale agent keys: weekly on Sunday at 03:00 UTC
    PERFORM cron.schedule(
      'deactivate-stale-keys',
      '0 3 * * 0',
      'SELECT public.deactivate_stale_agent_keys()'
    );

    -- 3. Event log rotation: daily at 04:30 UTC
    PERFORM cron.schedule(
      'cleanup-event-log',
      '30 4 * * *',
      'SELECT public.cleanup_event_log()'
    );

    -- 4a. Webhook retry processing: every 2 minutes
    PERFORM cron.schedule(
      'process-webhook-retries',
      '*/2 * * * *',
      'SELECT public.process_webhook_retries()'
    );

    -- 4b. Dead-letter + delivered webhook cleanup: daily at 05:00 UTC
    PERFORM cron.schedule(
      'cleanup-dead-webhooks',
      '0 5 * * *',
      'SELECT public.cleanup_dead_webhooks()'
    );

    -- 5. Usage metrics aggregation: daily at 01:00 UTC
    PERFORM cron.schedule(
      'aggregate-workspace-usage',
      '0 1 * * *',
      'SELECT public.aggregate_workspace_usage()'
    );

    -- 6. ANALYZE hot tables: daily at 05:30 UTC
    PERFORM cron.schedule(
      'analyze-hot-tables',
      '30 5 * * *',
      'ANALYZE tasks; ANALYZE event_log; ANALYZE request_log; ANALYZE webhook_delivery_log'
    );

  ELSE
    RAISE NOTICE 'pg_cron not available — skipping production automation schedules';
  END IF;
END;
$outer$;

-- ══════════════════════════════════════════════════════════════════════
-- RLS for new tables
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON webhook_delivery_log
  FOR ALL USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY workspace_isolation ON workspace_usage
  FOR ALL USING (workspace_id IN (SELECT get_user_workspace_ids()));
