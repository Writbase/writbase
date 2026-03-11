import type { Context, Next } from 'hono'
import { parseAgentKey, authenticateAgent } from '../../_shared/auth.ts'
import { createServiceClient } from '../../_shared/supabase-client.ts'
import type { WritBaseError } from '../../_shared/errors.ts'
import type { AgentContext } from '../../_shared/types.ts'
import { logger } from '../../_shared/logger.ts'

type AppEnv = {
  Variables: {
    requestId: string
    agentContext: AgentContext
  }
}

/**
 * Hono middleware that authenticates every request using agent keys.
 *
 * Extracts the `Authorization: Bearer wb_...` header, verifies the key
 * via `parseAgentKey` + `authenticateAgent`, and attaches the resulting
 * `AgentContext` to the Hono context as `agentContext`.
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader) {
    return c.json(
      {
        error: {
          code: 'unauthorized_agent_key',
          message: 'Invalid or missing agent key.',
          recovery:
            'Provide a valid agent key in the Authorization header as "Bearer wb_<key_id>_<secret>".',
        },
      },
      401
    )
  }

  try {
    const { keyId, secret } = parseAgentKey(authHeader)
    const supabase = createServiceClient()
    const agentContext = await authenticateAgent(supabase, keyId, secret)
    c.set('agentContext', agentContext)
    logger.info('Agent authenticated', { request_id: c.get('requestId'), agent_key_id: agentContext.keyId, role: agentContext.role })
    await next()
  } catch (err) {
    // WritBaseError instances have a `code` property
    const wbErr = err as WritBaseError
    if (wbErr.code) {
      const status = wbErr.code === 'inactive_agent_key' ? 403 : 401
      return c.json({ error: wbErr }, status)
    }
    // Unexpected error
    logger.error('Auth middleware error', { request_id: c.get('requestId'), error: String(err) })
    return c.json(
      {
        error: {
          code: 'unauthorized_agent_key',
          message: 'Authentication failed.',
          recovery:
            'Provide a valid agent key in the Authorization header as "Bearer wb_<key_id>_<secret>".',
        },
      },
      401
    )
  }
}
