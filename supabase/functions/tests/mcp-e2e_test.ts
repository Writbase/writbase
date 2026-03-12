/**
 * End-to-end tests for the WritBase MCP server against a remote Supabase instance.
 *
 * These tests bootstrap real data (agent keys, projects, permissions) via the
 * Supabase REST API, then exercise the full MCP tool flow through the deployed
 * Edge Function.
 *
 * Prerequisites:
 *   1. Remote Supabase project deployed (migrations + edge function)
 *   2. A user created in auth.users (triggers workspace auto-provisioning)
 *
 * Environment variables:
 *   MCP_TEST_URL           - Edge Function base URL (default: remote Supabase)
 *   SUPABASE_URL           - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for bootstrapping test data
 *   TEST_WORKSPACE_ID      - Workspace ID to use for tests
 *
 * Run:
 *   deno test supabase/functions/tests/mcp-e2e_test.ts \
 *     --allow-net --allow-env --allow-read \
 *     --config supabase/functions/mcp-server/deno.json
 */

import { assertEquals, assertExists } from '@std/assert'

// ── Configuration ───────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MCP_URL = Deno.env.get('MCP_TEST_URL') ?? `${SUPABASE_URL}/functions/v1/mcp-server`
const WORKSPACE_ID = Deno.env.get('TEST_WORKSPACE_ID') ?? ''

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required (e.g. https://your-project.supabase.co)')
}
if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Set it in env or .env')
}
if (!WORKSPACE_ID) {
  throw new Error('TEST_WORKSPACE_ID is required (UUID of a workspace with a provisioned user)')
}

// ── Crypto helpers (mirrors _shared/auth.ts) ────────────────────────

async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function generateAgentKey(): Promise<{
  fullKey: string
  keyId: string
  secret: string
  keyHash: string
  keyPrefix: string
}> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const keyId = crypto.randomUUID()
  const keyHash = await hashSecret(secret)
  const keyPrefix = secret.slice(0, 8)
  return { fullKey: `wb_${keyId}_${secret}`, keyId, secret, keyHash, keyPrefix }
}

// ── Supabase REST helpers ───────────────────────────────────────────

async function supabaseRest(
  table: string,
  opts: {
    method?: string
    body?: unknown
    query?: string
    headers?: Record<string, string>
    prefer?: string
  } = {},
): Promise<Response> {
  const method = opts.method ?? 'GET'
  const url = `${SUPABASE_URL}/rest/v1/${table}${opts.query ? `?${opts.query}` : ''}`
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...opts.headers,
  }
  if (opts.prefer) headers['Prefer'] = opts.prefer
  return await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

// ── MCP request helpers ─────────────────────────────────────────────

function jsonrpc(method: string, params: unknown = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

async function mcpCall(
  agentKey: string,
  method: string,
  params: unknown = {},
  id = 1,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${agentKey}`,
    },
    body: JSON.stringify(jsonrpc(method, params, id)),
  })
  const body = await res.json()
  return { status: res.status, body }
}

/** Extract text content from MCP tools/call result */
function extractToolResult(body: Record<string, unknown>): unknown {
  const result = body.result as Record<string, unknown> | undefined
  if (!result?.content) return null
  const content = result.content as Array<{ type: string; text: string }>
  return JSON.parse(content[0].text)
}

/** Check if the MCP result is an error */
function isToolError(body: Record<string, unknown>): boolean {
  const result = body.result as Record<string, unknown> | undefined
  return result?.isError === true
}

// ── Test state (populated during setup) ─────────────────────────────

interface TestState {
  managerKey: Awaited<ReturnType<typeof generateAgentKey>>
  workerKey: Awaited<ReturnType<typeof generateAgentKey>>
  projectId: string
  projectSlug: string
  taskId: string
}

const state: Partial<TestState> = {}

// IDs to clean up after all tests
const cleanupIds: {
  agentKeys: string[]
  permissions: string[]
  projects: string[]
  tasks: string[]
} = { agentKeys: [], permissions: [], projects: [], tasks: [] }

// ── Setup: bootstrap test data ──────────────────────────────────────

Deno.test({
  name: 'setup: create manager agent key',
  fn: async () => {
    state.managerKey = await generateAgentKey()
    const res = await supabaseRest('agent_keys', {
      method: 'POST',
      body: {
        id: state.managerKey.keyId,
        name: 'e2e-manager',
        role: 'manager',
        key_hash: state.managerKey.keyHash,
        key_prefix: state.managerKey.keyPrefix,
        is_active: true,
        workspace_id: WORKSPACE_ID,
        created_by: 'e2e-bootstrap',
      },
      prefer: 'return=minimal',
    })
    assertEquals(res.status, 201, `Failed to create manager key: ${await res.text()}`)
    cleanupIds.agentKeys.push(state.managerKey.keyId)
  },
})

Deno.test({
  name: 'setup: create worker agent key',
  fn: async () => {
    state.workerKey = await generateAgentKey()
    const res = await supabaseRest('agent_keys', {
      method: 'POST',
      body: {
        id: state.workerKey.keyId,
        name: 'e2e-worker',
        role: 'worker',
        key_hash: state.workerKey.keyHash,
        key_prefix: state.workerKey.keyPrefix,
        is_active: true,
        workspace_id: WORKSPACE_ID,
        created_by: 'e2e-bootstrap',
      },
      prefer: 'return=minimal',
    })
    assertEquals(res.status, 201, `Failed to create worker key: ${await res.text()}`)
    cleanupIds.agentKeys.push(state.workerKey.keyId)
  },
})

// ── Health check ────────────────────────────────────────────────────

Deno.test('health: GET /health returns ok', async () => {
  const res = await fetch(`${MCP_URL}/health`)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.status, 'ok')
  assertEquals(body.service, 'writbase-mcp-server')
})

// ── Auth tests ──────────────────────────────────────────────────────

Deno.test('auth: unauthenticated request returns 401', async () => {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonrpc('tools/list')),
  })
  assertEquals(res.status, 401)
  await res.text()
})

Deno.test('auth: manager key authenticates successfully', async () => {
  const { status, body } = await mcpCall(
    state.managerKey!.fullKey,
    'initialize',
    {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0' },
    },
  )
  assertEquals(status, 200)
  assertExists(body.result, `Initialize failed: ${JSON.stringify(body)}`)
})

Deno.test('auth: worker key authenticates successfully', async () => {
  const { status, body } = await mcpCall(
    state.workerKey!.fullKey,
    'initialize',
    {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0' },
    },
  )
  assertEquals(status, 200)
  assertExists(body.result)
})

// ── tools/list ──────────────────────────────────────────────────────

Deno.test('tools/list: manager sees all 11 tools', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/list')
  const result = body.result as { tools: Array<{ name: string }> }
  assertExists(result.tools)
  const names = result.tools.map((t) => t.name).sort()
  assertEquals(names.length, 11, `Expected 11 tools, got: ${names.join(', ')}`)
  // Verify key tools are present
  for (const expected of ['info', 'get_tasks', 'add_task', 'update_task', 'manage_projects', 'manage_agent_keys']) {
    assertEquals(names.includes(expected), true, `Missing tool: ${expected}`)
  }
})

Deno.test('tools/list: worker sees only 4 tools', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/list')
  const result = body.result as { tools: Array<{ name: string }> }
  assertExists(result.tools)
  const names = result.tools.map((t) => t.name).sort()
  assertEquals(names.length, 4, `Expected 4 tools, got: ${names.join(', ')}`)
  assertEquals(names, ['add_task', 'get_tasks', 'info', 'update_task'])
})

// ── info tool ───────────────────────────────────────────────────────

Deno.test('info: returns agent identity and role', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'info',
    arguments: {},
  })
  assertEquals(isToolError(body), false, `info returned error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  const agent = result.agent as Record<string, unknown>
  assertEquals(agent.name, 'e2e-manager')
  assertEquals(agent.role, 'manager')
})

// ── manage_projects: create project ─────────────────────────────────

Deno.test('manage_projects: create a test project', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'manage_projects',
    arguments: { action: 'create', name: 'E2E Test Project' },
  })
  assertEquals(isToolError(body), false, `create project error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertExists(result.id)
  assertExists(result.slug)
  state.projectId = result.id as string
  state.projectSlug = result.slug as string
  cleanupIds.projects.push(state.projectId)
})

// ── Setup: grant permissions via REST (bootstrap) ───────────────────
// Manager needs project permissions before it can grant them to others.
// Worker needs permissions before it can use tools scoped to the project.
// Both are bootstrapped via REST (service role) since manage_agent_permissions
// requires the granter to already have permissions on the project.

Deno.test('setup: grant manager permissions via REST', async () => {
  const permId = crypto.randomUUID()
  const res = await supabaseRest('agent_permissions', {
    method: 'POST',
    body: {
      id: permId,
      agent_key_id: state.managerKey!.keyId,
      project_id: state.projectId!,
      workspace_id: WORKSPACE_ID,
      can_read: true,
      can_create: true,
      can_update: true,
      can_assign: true,
    },
    prefer: 'return=minimal',
  })
  assertEquals(res.status, 201, `Failed to grant manager perms: ${await res.text()}`)
  cleanupIds.permissions.push(permId)
})

Deno.test('setup: grant worker permissions via REST', async () => {
  const permId = crypto.randomUUID()
  const res = await supabaseRest('agent_permissions', {
    method: 'POST',
    body: {
      id: permId,
      agent_key_id: state.workerKey!.keyId,
      project_id: state.projectId!,
      workspace_id: WORKSPACE_ID,
      can_read: true,
      can_create: true,
      can_update: true,
      can_assign: false,
    },
    prefer: 'return=minimal',
  })
  assertEquals(res.status, 201, `Failed to grant worker perms: ${await res.text()}`)
  cleanupIds.permissions.push(permId)
})

// ── manage_agent_permissions: verify via MCP ────────────────────────

Deno.test('manage_agent_permissions: manager lists worker permissions', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'manage_agent_permissions',
    arguments: {
      action: 'list',
      key_id: state.workerKey!.keyId,
    },
  })
  assertEquals(isToolError(body), false, `list permissions error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  const perms = result.permissions as Array<Record<string, unknown>>
  assertEquals(perms.length >= 1, true, 'Expected at least 1 permission')
})

// ── add_task: worker creates a task ─────────────────────────────────

Deno.test('add_task: worker creates a task in the project', async () => {
  // Worker needs to re-initialize to pick up new permissions (per-request server)
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'add_task',
    arguments: {
      project: state.projectSlug!,
      description: 'E2E test task: verify full MCP pipeline',
      priority: 'high',
    },
  })
  assertEquals(isToolError(body), false, `add_task error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertExists(result.id)
  assertEquals(result.status, 'todo')
  assertEquals(result.priority, 'high')
  assertEquals(result.version, 1)
  state.taskId = result.id as string
  cleanupIds.tasks.push(state.taskId)
})

// ── get_tasks: worker lists tasks ───────────────────────────────────

Deno.test('get_tasks: worker sees the created task', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: state.projectSlug! },
  })
  assertEquals(isToolError(body), false, `get_tasks error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result.tasks.length >= 1, true, 'Expected at least 1 task')
  const task = result.tasks.find((t) => t.id === state.taskId)
  assertExists(task, 'Created task not found in get_tasks result')
  assertEquals(task!.description, 'E2E test task: verify full MCP pipeline')
})

// ── get_tasks: filter by status ─────────────────────────────────────

Deno.test('get_tasks: filter by status=done returns empty', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: state.projectSlug!, status: 'done' },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result.tasks.length, 0)
})

// ── update_task: worker updates the task ────────────────────────────

Deno.test('update_task: worker moves task to in_progress', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: state.taskId!,
      version: 1,
      status: 'in_progress',
      notes: 'Starting work on this task',
    },
  })
  assertEquals(isToolError(body), false, `update_task error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.status, 'in_progress')
  assertEquals(result.version, 2)
})

// ── update_task: optimistic locking ─────────────────────────────────

Deno.test('update_task: stale version returns version_conflict', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: state.taskId!,
      version: 1, // stale — current is 2
      status: 'done',
    },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'version_conflict')
  assertEquals(result.current_version, 2)
})

// ── update_task: complete the task ──────────────────────────────────

Deno.test('update_task: worker completes the task', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: state.taskId!,
      version: 2,
      status: 'done',
    },
  })
  assertEquals(isToolError(body), false, `update_task error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.status, 'done')
  assertEquals(result.version, 3)
})

// ── get_provenance: manager views audit trail ───────────────────────

Deno.test('get_provenance: manager sees task events', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'get_provenance',
    arguments: {
      project: state.projectSlug!,
      target_type: 'task',
    },
  })
  assertEquals(isToolError(body), false, `get_provenance error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as { events: Array<Record<string, unknown>> }
  assertExists(result.events)
  assertEquals(result.events.length >= 1, true, 'Expected at least 1 provenance event')
})

// ── Authorization: worker cannot access manager tools ───────────────

Deno.test('authorization: worker cannot call manage_projects', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'manage_projects',
    arguments: { action: 'create', name: 'Forbidden Project' },
  })
  // Tool doesn't exist in worker schema, so SDK returns method_not_found or error
  const hasError = body.error !== undefined || isToolError(body)
  assertEquals(hasError, true, `Worker should not be able to call manage_projects`)
})

Deno.test('authorization: worker cannot call manage_agent_keys', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'list' },
  })
  const hasError = body.error !== undefined || isToolError(body)
  assertEquals(hasError, true)
})

// ── get_tasks: worker cannot access unpermitted project ─────────────

Deno.test('authorization: worker cannot get tasks from unpermitted project', async () => {
  const { body } = await mcpCall(state.workerKey!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: 'nonexistent-project-slug' },
  })
  // The dynamic schema uses Zod enum of permitted projects, so an invalid
  // slug is rejected at the schema level with a validation error (isError=true)
  assertEquals(isToolError(body), true)
})

// ── manage_agent_keys: manager lists keys ───────────────────────────

Deno.test('manage_agent_keys: manager lists keys in workspace', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'list' },
  })
  assertEquals(isToolError(body), false, `list keys error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as { keys: Array<Record<string, unknown>> }
  assertExists(result.keys)
  assertEquals(result.keys.length >= 2, true, 'Expected at least 2 keys (manager + worker)')
  const names = result.keys.map((k) => k.name)
  assertEquals(names.includes('e2e-manager'), true)
  assertEquals(names.includes('e2e-worker'), true)
})

// ── manage_agent_keys: manager creates a worker key via MCP ─────────

Deno.test('manage_agent_keys: manager creates a new worker key', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'create', name: 'e2e-created-worker' },
  })
  assertEquals(isToolError(body), false, `create key error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertExists(result.full_key)
  assertExists(result.key_id)
  assertEquals(result.role, 'worker')
  assertEquals(result.is_active, true)
  cleanupIds.agentKeys.push(result.key_id as string)
})

// ── discover_agents ─────────────────────────────────────────────────

Deno.test('discover_agents: manager lists agents for project', async () => {
  const { body } = await mcpCall(state.managerKey!.fullKey, 'tools/call', {
    name: 'discover_agents',
    arguments: { project: state.projectSlug! },
  })
  assertEquals(isToolError(body), false, `discover_agents error: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as { agents: Array<Record<string, unknown>> }
  assertExists(result.agents)
  // At least manager and worker have permissions on this project
  assertEquals(result.agents.length >= 2, true, `Expected at least 2 agents, got ${result.agents.length}`)
})

// ── Cleanup ─────────────────────────────────────────────────────────

Deno.test({
  name: 'cleanup: remove test data',
  // Sanitize options disabled — cleanup is best-effort
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Delete permissions first (FK references agent_keys and projects)
    for (const id of cleanupIds.permissions) {
      await supabaseRest('agent_permissions', {
        method: 'DELETE',
        query: `id=eq.${id}`,
      })
    }

    // Delete tasks
    for (const id of cleanupIds.tasks) {
      await supabaseRest('tasks', {
        method: 'DELETE',
        query: `id=eq.${id}`,
      })
    }

    // Note: event_log has an append-only trigger — cannot delete entries.
    // Test event_log entries are harmless and will be cleaned up by pg_cron.

    // Delete agent keys
    for (const id of cleanupIds.agentKeys) {
      // First remove any permissions referencing this key
      await supabaseRest('agent_permissions', {
        method: 'DELETE',
        query: `agent_key_id=eq.${id}`,
      })
      await supabaseRest('agent_keys', {
        method: 'DELETE',
        query: `id=eq.${id}`,
      })
    }

    // Delete projects
    for (const id of cleanupIds.projects) {
      await supabaseRest('projects', {
        method: 'DELETE',
        query: `id=eq.${id}`,
      })
    }
  },
})
