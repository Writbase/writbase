import type { Context, Next } from 'hono'
import { checkAuthRateLimit } from '../../_shared/auth-rate-limit.ts'
import { createServiceClient } from '../../_shared/supabase-client.ts'
import { logger } from '../../_shared/logger.ts'

type AppEnv = {
  Variables: {
    requestId: string
  }
}

/**
 * Extract the client IP from x-forwarded-for.
 * Supabase's proxy appends the real client IP as the last entry
 * (not spoofable by the client).
 */
function getClientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim())
    return parts[parts.length - 1]
  }
  // Fallback — should not happen behind Supabase's proxy
  return 'unknown'
}

/**
 * Pre-auth rate limiting middleware.
 * Runs BEFORE auth to block IPs with too many failed auth attempts.
 * Only failures are counted (via recordAuthFailure in auth-middleware).
 */
export async function preAuthRateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const ip = getClientIp(c)

  const supabase = createServiceClient()
  const { allowed, retryAfter } = await checkAuthRateLimit(supabase, ip)

  if (!allowed) {
    logger.warn('Pre-auth rate limit exceeded', { ip, request_id: c.get('requestId') })
    return c.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many failed authentication attempts.',
          recovery: 'Wait and retry after the indicated time.',
          retry_after: retryAfter,
        },
      },
      429
    )
  }

  await next()
}

export { getClientIp }
