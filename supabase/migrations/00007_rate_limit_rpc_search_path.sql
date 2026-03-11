-- Fix SECURITY DEFINER function: add SET search_path to prevent schema hijacking.
CREATE OR REPLACE FUNCTION increment_rate_limit(p_key_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO rate_limits (agent_key_id, window_start, request_count)
  VALUES (p_key_id, date_trunc('minute', now()), 1)
  ON CONFLICT (agent_key_id, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count;
$$;
