import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger.ts'

const PRE_AUTH_FAILURE_LIMIT = 30 // failed auth attempts per minute per IP

/**
 * Check if an IP has exceeded the pre-auth failure rate limit.
 * Uses check (not increment) — only failures are counted via recordAuthFailure.
 */
export async function checkAuthRateLimit(
  supabase: SupabaseClient,
  ip: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const { data, error } = await supabase.rpc('check_auth_rate_limit', {
    p_ip: ip,
  })

  if (error) {
    // Fail open: allow the request when rate limiting is unavailable.
    // Auth verification itself rejects invalid keys.
    logger.warn('Pre-auth rate limit check failed, allowing request', { ip, error: error.message })
    return { allowed: true }
  }

  const count = data as number
  if (count >= PRE_AUTH_FAILURE_LIMIT) {
    const retryAfter = 60 - (Math.floor(Date.now() / 1000) % 60) + Math.floor(Math.random() * 5)
    return { allowed: false, retryAfter }
  }

  return { allowed: true }
}

/**
 * Record a failed auth attempt for an IP address.
 * Called after authentication fails (not on success).
 */
export async function recordAuthFailure(
  supabase: SupabaseClient,
  ip: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_auth_rate_limit', {
    p_ip: ip,
  })

  if (error) {
    logger.warn('Failed to record auth failure', { ip, error: error.message })
  }
}
