/**
 * Integration tests for the WritBase MCP server Edge Function.
 *
 * These tests use raw `fetch` rather than the MCP SDK Client because the
 * server creates a per-request McpServer with session teardown, so SDK
 * session state does not persist across requests.
 *
 * Prerequisites:
 *   1. `supabase start`
 *   2. `supabase functions serve` (in a separate terminal)
 *
 * Run:
 *   deno test supabase/functions/tests/mcp-server_test.ts \
 *     --allow-net --allow-env \
 *     --config supabase/functions/mcp-server/deno.json
 *
 * CI integration (requires Supabase CLI):
 *   # Uncomment when Supabase CLI is available in CI:
 *   # - uses: supabase/setup-cli@v1
 *   #   with:
 *   #     version: 2.x
 *   # - run: supabase start
 *   # - run: supabase functions serve &
 *   # - run: sleep 5
 *   # - run: deno test supabase/functions/tests/ --allow-net --allow-env --config supabase/functions/mcp-server/deno.json
 */

import { assertEquals, assertStringIncludes } from '@std/assert'

const BASE_URL =
  Deno.env.get('MCP_TEST_URL') ??
  'http://localhost:54321/functions/v1/mcp-server'

// ── Helpers ─────────────────────────────────────────────────────────

/** Send a JSON-RPC POST to /mcp with optional extra headers. */
async function mcpPost(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

/** Build a minimal JSON-RPC envelope. */
function jsonrpc(method: string, params: unknown = {}, id: number = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

// ── Health endpoint ─────────────────────────────────────────────────

Deno.test('GET /health returns ok', async () => {
  const response = await fetch(`${BASE_URL}/health`)
  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body.status, 'ok')
  assertEquals(body.service, 'writbase-mcp-server')
  assertEquals(typeof body.request_id, 'string')
})

// ── Request ID propagation ─────────────────────────────────────────

Deno.test('All responses include X-Request-ID header', async () => {
  const response = await fetch(`${BASE_URL}/health`)
  const requestId = response.headers.get('X-Request-ID')
  assertEquals(typeof requestId, 'string')
  assertEquals(requestId!.length, 36) // UUID v4 format
  await response.text() // consume body
})

Deno.test('X-Request-ID is unique per request', async () => {
  const r1 = await fetch(`${BASE_URL}/health`)
  const r2 = await fetch(`${BASE_URL}/health`)
  const id1 = r1.headers.get('X-Request-ID')
  const id2 = r2.headers.get('X-Request-ID')
  assertEquals(typeof id1, 'string')
  assertEquals(typeof id2, 'string')
  assertEquals(id1 !== id2, true)
  await r1.text()
  await r2.text()
})

// ── Auth rejection ─────────────────────────────────────────────────

Deno.test('POST /mcp without auth returns 401', async () => {
  const response = await mcpPost(
    jsonrpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    }),
  )
  assertEquals(response.status, 401)
  const body = await response.json()
  assertEquals(body.error.code, 'unauthorized_agent_key')
  assertStringIncludes(body.error.recovery, 'Bearer wb_')
})

Deno.test('POST /mcp with malformed auth returns 401', async () => {
  const response = await mcpPost(jsonrpc('tools/list'), {
    Authorization: 'Bearer invalid-key-format',
  })
  assertEquals(response.status, 401)
  await response.text() // consume body
})

Deno.test('POST /mcp with non-existent key returns 401', async () => {
  const fakeKey = `Bearer wb_${'00000000-0000-0000-0000-000000000000'}_${'a'.repeat(64)}`
  const response = await mcpPost(jsonrpc('tools/list'), {
    Authorization: fakeKey,
  })
  assertEquals(response.status, 401)
  await response.text() // consume body
})

Deno.test('POST /mcp with empty Authorization header returns 401', async () => {
  const response = await mcpPost(jsonrpc('tools/list'), {
    Authorization: '',
  })
  assertEquals(response.status, 401)
  await response.text() // consume body
})

Deno.test('POST /mcp with wrong scheme returns 401', async () => {
  const response = await mcpPost(jsonrpc('tools/list'), {
    Authorization: 'Basic dXNlcjpwYXNz',
  })
  assertEquals(response.status, 401)
  await response.text() // consume body
})

// ── Origin policy ──────────────────────────────────────────────────

Deno.test('Requests without Origin header are allowed', async () => {
  const response = await fetch(`${BASE_URL}/health`)
  // CLI agents never send Origin — should succeed
  assertEquals(response.status, 200)
  await response.text() // consume body
})

// ── OPTIONS preflight ──────────────────────────────────────────────

Deno.test('OPTIONS /mcp returns 204', async () => {
  const response = await fetch(`${BASE_URL}/mcp`, { method: 'OPTIONS' })
  assertEquals(response.status, 204)
  await response.text() // consume body
})

Deno.test('OPTIONS /health returns 204', async () => {
  const response = await fetch(`${BASE_URL}/health`, { method: 'OPTIONS' })
  assertEquals(response.status, 204)
  await response.text() // consume body
})

// ── DELETE /mcp ────────────────────────────────────────────────────

Deno.test('DELETE /mcp without auth returns 401', async () => {
  const response = await fetch(`${BASE_URL}/mcp`, { method: 'DELETE' })
  // Auth middleware applies to /mcp — DELETE without credentials should fail
  assertEquals(response.status, 401)
  await response.text() // consume body
})

// ── GET /mcp (SSE) ─────────────────────────────────────────────────

Deno.test('GET /mcp without auth returns 401', async () => {
  const response = await fetch(`${BASE_URL}/mcp`)
  assertEquals(response.status, 401)
  await response.text() // consume body
})

// ── Content-Type enforcement ───────────────────────────────────────

Deno.test('POST /mcp without Content-Type still returns 401 (auth checked first)', async () => {
  const response = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    body: '{}',
  })
  // Auth middleware runs before body parsing, so expect 401
  assertEquals(response.status, 401)
  await response.text() // consume body
})

// ── Unknown route ──────────────────────────────────────────────────

Deno.test('GET /nonexistent returns 404', async () => {
  const response = await fetch(`${BASE_URL}/nonexistent`)
  assertEquals(response.status, 404)
  await response.text() // consume body
})

// ── Health endpoint response structure ─────────────────────────────

Deno.test('GET /health response has exactly the expected keys', async () => {
  const response = await fetch(`${BASE_URL}/health`)
  const body = await response.json()
  const keys = Object.keys(body).sort()
  assertEquals(keys, ['request_id', 'service', 'status'])
})
