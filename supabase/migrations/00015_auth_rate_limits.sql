-- Pre-auth rate limiting by IP address.
-- Tracks failed authentication attempts per IP per minute window.
-- Separate from rate_limits (which requires an existing agent_key FK).

CREATE TABLE auth_rate_limits (
  ip_address text NOT NULL,
  window_start timestamptz NOT NULL,
  failure_count integer DEFAULT 1 NOT NULL,
  PRIMARY KEY (ip_address, window_start)
);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No RLS SELECT policies — only accessed via SECURITY DEFINER RPCs.

-- Atomically increment the failure counter for an IP + minute window.
CREATE OR REPLACE FUNCTION increment_auth_rate_limit(p_ip text)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO auth_rate_limits (ip_address, window_start, failure_count)
  VALUES (p_ip, date_trunc('minute', now()), 1)
  ON CONFLICT (ip_address, window_start)
  DO UPDATE SET failure_count = auth_rate_limits.failure_count + 1
  RETURNING failure_count;
$$;

-- Check the current failure count for an IP in the current minute window.
CREATE OR REPLACE FUNCTION check_auth_rate_limit(p_ip text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT failure_count FROM auth_rate_limits
     WHERE ip_address = p_ip AND window_start = date_trunc('minute', now())),
    0
  );
$$;

-- Cleanup function for pg_cron: purge entries older than 1 hour
CREATE OR REPLACE FUNCTION cleanup_auth_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM auth_rate_limits WHERE window_start < now() - interval '1 hour';
$$;

-- Schedule cleanup daily at 04:00 UTC
SELECT cron.schedule(
  'cleanup-auth-rate-limits',
  '0 4 * * *',
  $$SELECT public.cleanup_auth_rate_limits()$$
);
