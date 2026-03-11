import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger.ts'

const DEFAULT_LIMIT = 60 // requests per minute

/**
 * Check rate limit for an agent key using a Postgres-based per-minute window.
 *
 * Calls the `increment_rate_limit` RPC which atomically upserts the count:
 *   INSERT INTO rate_limits (agent_key_id, window_start, request_count)
 *   VALUES ($1, date_trunc('minute', now()), 1)
 *   ON CONFLICT (agent_key_id, window_start)
 *   DO UPDATE SET request_count = rate_limits.request_count + 1
 *   RETURNING request_count;
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  keyId: string,
  limit: number = DEFAULT_LIMIT
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key_id: keyId,
  })

  if (error) {
    // Fail open: allow the request when rate limiting is unavailable.
    // Auth is enforced separately; rate limiting is protective, not a security gate.
    logger.warn('Rate limit check failed, allowing request', { agent_key_id: keyId, error: error.message })
    return { allowed: true }
  }

  const count = data as number
  if (count > limit) {
    const retryAfter = 60 - (Math.floor(Date.now() / 1000) % 60) + Math.floor(Math.random() * 5)
    return { allowed: false, retryAfter }
  }

  return { allowed: true }
}
