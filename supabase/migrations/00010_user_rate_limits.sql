-- Per-user rate limiting for the human dashboard.
-- Separate from agent rate_limits which has FK to agent_keys.

CREATE TABLE user_rate_limits (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, window_start)
);

-- Atomic upsert: increment per-minute counter for a user
CREATE OR REPLACE FUNCTION increment_user_rate_limit(p_user_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO user_rate_limits (user_id, window_start, request_count)
  VALUES (p_user_id, date_trunc('minute', now()), 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET request_count = user_rate_limits.request_count + 1
  RETURNING request_count;
$$;

-- Update cleanup function to also clean user_rate_limits
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH deleted_agent AS (
    DELETE FROM rate_limits
    WHERE window_start < now() - interval '5 minutes'
    RETURNING 1
  ),
  deleted_user AS (
    DELETE FROM user_rate_limits
    WHERE window_start < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM deleted_agent) + (SELECT count(*) FROM deleted_user)
  INTO v_count;

  RETURN v_count;
END;
$$;
