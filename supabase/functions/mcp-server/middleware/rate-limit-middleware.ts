import type { Context, Next } from 'hono'
import { checkRateLimit } from '../../_shared/rate-limit.ts'
import { createServiceClient } from '../../_shared/supabase-client.ts'
import type { AgentContext } from '../../_shared/types.ts'

type AppEnv = {
  Variables: {
    requestId: string
    agentContext: AgentContext
  }
}

/**
 * Hono middleware that enforces per-agent rate limits.
 *
 * Must run after auth middleware so that `agentContext` is available.
 * Calls `checkRateLimit` and returns a 429 response with `retry_after`
 * if the limit is exceeded.
 */
export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const agentContext = c.get('agentContext')

  if (!agentContext) {
    // Should never happen if auth middleware runs first
    return c.json(
      { error: { code: 'unauthorized_agent_key', message: 'Missing agent context.' } },
      401
    )
  }

  const supabase = createServiceClient()
  const { allowed, retryAfter } = await checkRateLimit(supabase, agentContext.keyId)

  if (!allowed) {
    return c.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Rate limit exceeded.',
          recovery: 'Wait and retry after the indicated time.',
          retry_after: retryAfter,
        },
      },
      429
    )
  }

  await next()
}
