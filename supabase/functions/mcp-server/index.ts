import { Hono } from 'hono'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { authMiddleware } from './middleware/auth-middleware.ts'
import { rateLimitMiddleware } from './middleware/rate-limit-middleware.ts'
import { createMcpServerForAgent } from './schema/dynamic-schema.ts'
import { createServiceClient } from '../_shared/supabase-client.ts'
import type { AgentContext } from '../_shared/types.ts'

const app = new Hono()

// ── Request ID middleware ─────────────────────────────────────────────
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-ID', requestId)
  await next()
})

// ── Origin policy ─────────────────────────────────────────────────────
// Allow missing Origin (CLI agents) but reject unauthorized browser Origins.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean)

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin')
  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return c.json(
      { error: { code: 'forbidden', message: 'Origin not allowed.', request_id: c.get('requestId') } },
      403
    )
  }
  // Set CORS headers for valid origins
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  }
  await next()
})

// ── Preflight ─────────────────────────────────────────────────────────
app.options('*', (c) => {
  return c.text('', 204)
})

// ── Health check (no auth required) ───────────────────────────────────
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'writbase-mcp-server', request_id: c.get('requestId') })
})

// ── Auth + rate limit on all /mcp routes ──────────────────────────────
app.use('/mcp', authMiddleware)
app.use('/mcp', rateLimitMiddleware)
app.use('/mcp/*', authMiddleware)
app.use('/mcp/*', rateLimitMiddleware)

// ── POST /mcp — main MCP request endpoint ─────────────────────────────
app.post('/mcp', async (c) => {
  const requestId = c.get('requestId') as string
  const agentContext = c.get('agentContext') as AgentContext
  const supabase = createServiceClient()

  console.log(`[${requestId}] POST /mcp agent=${agentContext.agentKeyId}`)

  // Create a per-request MCP server scoped to this agent
  const mcpServer = await createMcpServerForAgent(agentContext, supabase)

  // Create a Streamable HTTP transport for this request
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })

  // Connect the server to the transport
  await mcpServer.connect(transport)

  // Handle the incoming request through the transport
  const body = await c.req.json()
  const req = new Request(c.req.url, {
    method: 'POST',
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  })

  const response = await transport.handleRequest(req)

  // Close the transport after handling
  await transport.close()
  await mcpServer.close()

  return response
})

// ── GET /mcp — SSE endpoint for server-to-client notifications ────────
app.get('/mcp', async (c) => {
  const requestId = c.get('requestId') as string
  const agentContext = c.get('agentContext') as AgentContext
  const supabase = createServiceClient()

  console.log(`[${requestId}] GET /mcp (SSE) agent=${agentContext.agentKeyId}`)

  const mcpServer = await createMcpServerForAgent(agentContext, supabase)

  const transport = new StreamableHTTPServerTransport({
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
app.delete('/mcp', async (c) => {
  const requestId = c.get('requestId') as string
  console.log(`[${requestId}] DELETE /mcp session cleanup`)
  // Session cleanup — the Streamable HTTP transport handles this
  return c.json({ status: 'session_closed', request_id: requestId })
})

// ── Serve ─────────────────────────────────────────────────────────────
Deno.serve(app.fetch)
