import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authMiddleware } from './middleware/auth-middleware.ts'
import { preAuthRateLimitMiddleware } from './middleware/pre-auth-rate-limit-middleware.ts'
import { rateLimitMiddleware } from './middleware/rate-limit-middleware.ts'
import { createMcpServerForAgent } from './schema/dynamic-schema.ts'
import { createServiceClient } from '../_shared/supabase-client.ts'
import { logger } from '../_shared/logger.ts'
import { initSentry, captureException } from '../_shared/sentry.ts'
import type { AgentContext } from '../_shared/types.ts'

initSentry()

type AppEnv = {
  Variables: {
    requestId: string
    agentContext: AgentContext
  }
}

const app = new Hono<AppEnv>()

// ── Request ID middleware ─────────────────────────────────────────────
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-ID', requestId)
  await next()
})

// ── CORS policy ──────────────────────────────────────────────────────
// Requests without Origin (CLI agents, MCP clients) pass through — agent
// key auth is the security layer for those. Browser requests are validated
// against ALLOWED_ORIGINS; denied origins receive no Access-Control-Allow-Origin
// header which causes standard browser CORS enforcement.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean)
const isDev = Deno.env.get('ENVIRONMENT') === 'development'

if (ALLOWED_ORIGINS.length === 0 && !isDev) {
  logger.warn('ALLOWED_ORIGINS is empty in production — all browser origins will be denied')
}

app.use('*', cors({
  origin: (origin) => {
    if (ALLOWED_ORIGINS.length === 0 && isDev) return origin   // dev: allow all
    if (ALLOWED_ORIGINS.length === 0) return null               // prod: deny all browser origins
    return ALLOWED_ORIGINS.includes(origin) ? origin : null
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
}))

// ── Health check (no auth required) ───────────────────────────────────
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'writbase-mcp-server', request_id: c.get('requestId') })
})

// ── Pre-auth rate limit + Auth + post-auth rate limit on all /mcp routes
app.use('/mcp', preAuthRateLimitMiddleware)
app.use('/mcp', authMiddleware)
app.use('/mcp', rateLimitMiddleware)
app.use('/mcp/*', preAuthRateLimitMiddleware)
app.use('/mcp/*', authMiddleware)
app.use('/mcp/*', rateLimitMiddleware)

// ── POST /mcp — main MCP request endpoint ─────────────────────────────
app.post('/mcp', async (c) => {
  const requestId = c.get('requestId')
  const agentContext = c.get('agentContext')
  const supabase = createServiceClient()

  let toolName = 'unknown'
  try {
    const clone = c.req.raw.clone()
    const body = await clone.json()
    toolName = body.method === 'tools/call' ? body.params?.name ?? 'unknown' : body.method ?? 'unknown'
  } catch {
    // malformed JSON — let the SDK handle it
  }

  logger.info('POST /mcp', { request_id: requestId, agent_key_id: agentContext.keyId, role: agentContext.role, tool: toolName })

  // Create a per-request MCP server scoped to this agent
  const mcpServer = await createMcpServerForAgent(agentContext, supabase)

  // Create a web-standard Streamable HTTP transport for this request
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })

  // Connect the server to the transport
  await mcpServer.connect(transport)

  const startMs = performance.now()
  let response: Response
  let errorCode: string | undefined
  try {
    response = await transport.handleRequest(c.req.raw)
  } catch (err) {
    errorCode = err instanceof Error ? err.message : 'unknown'
    captureException(err)
    throw err
  }
  const elapsedMs = Math.round(performance.now() - startMs)

  // Close the transport after handling
  await transport.close()
  await mcpServer.close()

  const status = errorCode ? 'error' : 'ok'
  logger.info('MCP request completed', { request_id: requestId, agent_key_id: agentContext.keyId, tool: toolName, latency_ms: elapsedMs, status })

  // Fire-and-forget request log write
  // Note: waitUntil background tasks don't complete in local dev with `supabase functions serve`
  try {
    const logPromise = (async () => {
      try {
        await supabase.from('request_log').insert({
          agent_key_id: agentContext.keyId,
          tool_name: toolName,
          latency_ms: elapsedMs,
          status,
          error_code: errorCode ?? null,
        })
      } catch (err) {
        logger.error('Background request log write failed', { error: err instanceof Error ? err.message : String(err) })
      }
    })()
    // @ts-ignore — EdgeRuntime.waitUntil exists in Supabase Edge runtime but not in type defs
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore — EdgeRuntime.waitUntil is a Supabase Edge runtime API not in type defs
      EdgeRuntime.waitUntil(logPromise)
    }
  } catch {
    // Ignore — logging should never break the request
  }

  return response
})

// ── GET /mcp — SSE endpoint for server-to-client notifications ────────
app.get('/mcp', async (c) => {
  const requestId = c.get('requestId')
  const agentContext = c.get('agentContext')
  const supabase = createServiceClient()

  logger.info('GET /mcp (SSE)', { request_id: requestId, agent_key_id: agentContext.keyId, role: agentContext.role })

  const mcpServer = await createMcpServerForAgent(agentContext, supabase)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })

  await mcpServer.connect(transport)

  const req = new Request(c.req.url, {
    method: 'GET',
    headers: c.req.raw.headers,
  })

  const response = await transport.handleRequest(req)

  return response
})

// ── DELETE /mcp — session cleanup ─────────────────────────────────────
app.delete('/mcp', (c) => {
  const requestId = c.get('requestId')
  logger.info('DELETE /mcp session cleanup', { request_id: requestId })
  // Session cleanup — the Streamable HTTP transport handles this
  return c.json({ status: 'session_closed', request_id: requestId })
})

// ── Global error handler ─────────────────────────────────────────────
app.onError((err, c) => {
  captureException(err)
  logger.error('Unhandled error', { error: err.message, request_id: c.get('requestId') })
  return c.json(
    { error: { code: 'internal_error', message: 'Internal server error', request_id: c.get('requestId') } },
    500
  )
})

// ── Serve ─────────────────────────────────────────────────────────────
Deno.serve(app.fetch)
