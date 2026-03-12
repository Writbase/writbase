/**
 * Behavioral e2e tests for the WritBase MCP server.
 *
 * These tests cover edge cases, multi-agent interactions, department workflows,
 * webhook subscriptions, task assignment, project lifecycle, and key rotation.
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY="..." deno test supabase/functions/tests/mcp-e2e-behavior_test.ts \
 *     --allow-net --allow-env --allow-read \
 *     --config supabase/functions/mcp-server/deno.json
 */

import { assertEquals, assertExists } from '@std/assert'

// ── Configuration ───────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://bblhnneesokjhcbvffkp.supabase.co'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MCP_URL = Deno.env.get('MCP_TEST_URL') ?? `${SUPABASE_URL}/functions/v1/mcp-server`
const WORKSPACE_ID = Deno.env.get('TEST_WORKSPACE_ID') ?? '56b58c18-5828-4df8-a581-855f6d94fb4d'

if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

// ── Crypto helpers ──────────────────────────────────────────────────

async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function generateAgentKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  const keyId = crypto.randomUUID()
  const keyHash = await hashSecret(secret)
  const keyPrefix = secret.slice(0, 8)
  return { fullKey: `wb_${keyId}_${secret}`, keyId, secret, keyHash, keyPrefix }
}

// ── REST + MCP helpers ──────────────────────────────────────────────

async function supabaseRest(
  table: string,
  opts: { method?: string; body?: unknown; query?: string; prefer?: string } = {},
): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${opts.query ? `?${opts.query}` : ''}`
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  if (opts.prefer) headers['Prefer'] = opts.prefer
  return await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

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

function extractToolResult(body: Record<string, unknown>): unknown {
  const result = body.result as Record<string, unknown> | undefined
  if (!result?.content) return null
  const content = result.content as Array<{ type: string; text: string }>
  try {
    return JSON.parse(content[0].text)
  } catch {
    return content[0].text
  }
}

function isToolError(body: Record<string, unknown>): boolean {
  const result = body.result as Record<string, unknown> | undefined
  return result?.isError === true
}

// ── Shared test state ───────────────────────────────────────────────

const keys = {
  manager: null as Awaited<ReturnType<typeof generateAgentKey>> | null,
  workerA: null as Awaited<ReturnType<typeof generateAgentKey>> | null,
  workerB: null as Awaited<ReturnType<typeof generateAgentKey>> | null,
  inactive: null as Awaited<ReturnType<typeof generateAgentKey>> | null,
}

const ids = {
  projectId: '',
  projectSlug: '',
  departmentId: '',
  departmentSlug: '',
  taskIds: [] as string[],
  webhookId: '',
}

const cleanup: {
  agentKeys: string[]
  permissions: string[]
  projects: string[]
  departments: string[]
  tasks: string[]
  webhooks: string[]
} = { agentKeys: [], permissions: [], projects: [], departments: [], tasks: [], webhooks: [] }

// Helper to insert agent key via REST
async function createKeyViaRest(name: string, role: 'manager' | 'worker', isActive = true) {
  const key = await generateAgentKey()
  const res = await supabaseRest('agent_keys', {
    method: 'POST',
    body: {
      id: key.keyId,
      name,
      role,
      key_hash: key.keyHash,
      key_prefix: key.keyPrefix,
      is_active: isActive,
      workspace_id: WORKSPACE_ID,
      created_by: 'e2e-behavior-bootstrap',
    },
    prefer: 'return=minimal',
  })
  assertEquals(res.status, 201, `Failed to create key "${name}": ${await res.text()}`)
  cleanup.agentKeys.push(key.keyId)
  return key
}

async function grantPermsViaRest(keyId: string, projectId: string, perms: Record<string, boolean>) {
  const permId = crypto.randomUUID()
  const res = await supabaseRest('agent_permissions', {
    method: 'POST',
    body: {
      id: permId,
      agent_key_id: keyId,
      project_id: projectId,
      workspace_id: WORKSPACE_ID,
      can_read: perms.can_read ?? false,
      can_create: perms.can_create ?? false,
      can_update: perms.can_update ?? false,
      can_assign: perms.can_assign ?? false,
    },
    prefer: 'return=minimal',
  })
  assertEquals(res.status, 201, `Failed to grant perms: ${await res.text()}`)
  cleanup.permissions.push(permId)
}

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

Deno.test('setup: create agent keys', async () => {
  keys.manager = await createKeyViaRest('e2e-beh-manager', 'manager')
  keys.workerA = await createKeyViaRest('e2e-beh-worker-a', 'worker')
  keys.workerB = await createKeyViaRest('e2e-beh-worker-b', 'worker')
  keys.inactive = await createKeyViaRest('e2e-beh-inactive', 'worker', false)
})

Deno.test('setup: create project and department via MCP', async () => {
  // Create project
  const { body: projBody } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_projects',
    arguments: { action: 'create', name: 'E2E Behavior Project' },
  })
  assertEquals(isToolError(projBody), false, `create project: ${JSON.stringify(projBody)}`)
  const proj = extractToolResult(projBody) as Record<string, unknown>
  ids.projectId = proj.id as string
  ids.projectSlug = proj.slug as string
  cleanup.projects.push(ids.projectId)

  // Grant manager permissions on project
  await grantPermsViaRest(keys.manager!.keyId, ids.projectId, {
    can_read: true, can_create: true, can_update: true, can_assign: true,
  })

  // Create department
  const { body: deptBody } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_departments',
    arguments: { action: 'create', name: 'E2E Engineering' },
  })
  assertEquals(isToolError(deptBody), false, `create department: ${JSON.stringify(deptBody)}`)
  const dept = extractToolResult(deptBody) as Record<string, unknown>
  ids.departmentId = dept.id as string
  ids.departmentSlug = dept.slug as string
  cleanup.departments.push(ids.departmentId)
})

Deno.test('setup: grant worker permissions', async () => {
  // Worker A: full permissions
  await grantPermsViaRest(keys.workerA!.keyId, ids.projectId, {
    can_read: true, can_create: true, can_update: true, can_assign: false,
  })
  // Worker B: read-only
  await grantPermsViaRest(keys.workerB!.keyId, ids.projectId, {
    can_read: true, can_create: false, can_update: false, can_assign: false,
  })
  // Inactive worker: full permissions (but key is inactive)
  await grantPermsViaRest(keys.inactive!.keyId, ids.projectId, {
    can_read: true, can_create: true, can_update: true, can_assign: false,
  })
})

// ═══════════════════════════════════════════════════════════════════
// INACTIVE KEY BEHAVIOR
// ═══════════════════════════════════════════════════════════════════

Deno.test('inactive key: authentication rejected with 403', async () => {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${keys.inactive!.fullKey}`,
    },
    body: JSON.stringify(jsonrpc('tools/list')),
  })
  assertEquals(res.status, 403)
  const body = await res.json()
  assertEquals(body.error.code, 'inactive_agent_key')
})

// ═══════════════════════════════════════════════════════════════════
// READ-ONLY WORKER BEHAVIOR
// ═══════════════════════════════════════════════════════════════════

Deno.test('read-only worker: can list tasks', async () => {
  const { body } = await mcpCall(keys.workerB!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug },
  })
  assertEquals(isToolError(body), false, `get_tasks: ${JSON.stringify(body)}`)
})

Deno.test('read-only worker: cannot create task', async () => {
  const { body } = await mcpCall(keys.workerB!.fullKey, 'tools/call', {
    name: 'add_task',
    arguments: { project: ids.projectSlug, description: 'Should fail' },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'scope_not_allowed')
})

// ═══════════════════════════════════════════════════════════════════
// TASK LIFECYCLE WITH DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════

Deno.test('add_task: create task with critical priority', async () => {
  // Note: department param requires dept-scoped permissions in the agent's
  // permission set. Worker A has project-wide permissions, so department is
  // not available in the dynamic schema (z.never()). This is tested by
  // verifying the schema rejects it (see dynamic schema design).
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'add_task',
    arguments: {
      project: ids.projectSlug,
      description: 'Critical priority task for e2e behavior test',
      priority: 'critical',
    },
  })
  assertEquals(isToolError(body), false, `add_task: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertEquals(task.priority, 'critical')
  ids.taskIds.push(task.id as string)
  cleanup.tasks.push(task.id as string)
})

Deno.test('add_task: create task with initial status blocked', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'add_task',
    arguments: {
      project: ids.projectSlug,
      description: 'Blocked from the start',
      status: 'blocked',
    },
  })
  assertEquals(isToolError(body), false, `add_task blocked: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertEquals(task.status, 'blocked')
  ids.taskIds.push(task.id as string)
  cleanup.tasks.push(task.id as string)
})

Deno.test('add_task: create task with due date', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'add_task',
    arguments: {
      project: ids.projectSlug,
      description: 'Task with deadline',
      due_date: '2026-12-31',
      notes: 'End of year deadline',
    },
  })
  assertEquals(isToolError(body), false, `add_task due_date: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertExists(task.due_date)
  assertEquals(task.notes, 'End of year deadline')
  ids.taskIds.push(task.id as string)
  cleanup.tasks.push(task.id as string)
})

// ═══════════════════════════════════════════════════════════════════
// GET_TASKS FILTERING
// ═══════════════════════════════════════════════════════════════════

Deno.test('get_tasks: filter by priority=critical', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug, priority: 'critical' },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result.tasks.length >= 1, true)
  for (const t of result.tasks) {
    assertEquals(t.priority, 'critical')
  }
})

Deno.test('get_tasks: filter by status=blocked', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug, status: 'blocked' },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result.tasks.length >= 1, true)
  for (const t of result.tasks) {
    assertEquals(t.status, 'blocked')
  }
})

Deno.test('get_tasks: search by keyword', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug, search: 'deadline' },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result.tasks.length >= 1, true, 'Search for "deadline" should find task with notes containing it')
})

Deno.test('get_tasks: pagination with limit', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug, limit: 1 },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>>; next_cursor?: string }
  assertEquals(result.tasks.length, 1)
  assertExists(result.next_cursor, 'Should have next_cursor when more results exist')

  // Fetch next page
  const { body: page2 } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug, limit: 1, cursor: result.next_cursor },
  })
  assertEquals(isToolError(page2), false)
  const result2 = extractToolResult(page2) as { tasks: Array<Record<string, unknown>> }
  assertEquals(result2.tasks.length >= 1, true)
  // Different task from first page
  assertEquals(result2.tasks[0].id !== result.tasks[0].id, true, 'Second page should have different task')
})

// ═══════════════════════════════════════════════════════════════════
// MULTI-FIELD UPDATE
// ═══════════════════════════════════════════════════════════════════

Deno.test('update_task: update multiple fields at once', async () => {
  const taskId = ids.taskIds[0]
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: taskId,
      version: 1,
      priority: 'low',
      status: 'in_progress',
      notes: 'Reprioritized and started',
    },
  })
  assertEquals(isToolError(body), false, `multi-field update: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertEquals(task.priority, 'low')
  assertEquals(task.status, 'in_progress')
  assertEquals(task.notes, 'Reprioritized and started')
  assertEquals(task.version, 2)
})

// ═══════════════════════════════════════════════════════════════════
// CROSS-AGENT VISIBILITY
// ═══════════════════════════════════════════════════════════════════

Deno.test('cross-agent: worker B can read tasks created by worker A', async () => {
  const { body } = await mcpCall(keys.workerB!.fullKey, 'tools/call', {
    name: 'get_tasks',
    arguments: { project: ids.projectSlug },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { tasks: Array<Record<string, unknown>> }
  const found = result.tasks.find((t) => t.id === ids.taskIds[0])
  assertExists(found, 'Worker B should see tasks created by Worker A')
})

Deno.test('cross-agent: worker B cannot update task created by worker A', async () => {
  const { body } = await mcpCall(keys.workerB!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: { task_id: ids.taskIds[0], version: 2, status: 'done' },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'scope_not_allowed')
})

// ═══════════════════════════════════════════════════════════════════
// TASK ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════

Deno.test('task assignment: manager assigns task to worker A', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: ids.taskIds[0],
      version: 2,
      assign_to: keys.workerA!.keyId,
    },
  })
  assertEquals(isToolError(body), false, `assign task: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertEquals(task.assigned_to_agent_key_id, keys.workerA!.keyId)
  assertEquals(task.version, 3)
})

Deno.test('task assignment: worker without can_assign cannot assign', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: ids.taskIds[0],
      version: 3,
      assign_to: keys.workerB!.keyId,
    },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'assign_not_allowed')
})

Deno.test('task assignment: cannot assign to nonexistent agent', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: ids.taskIds[0],
      version: 3,
      assign_to: '00000000-0000-0000-0000-000000000099',
    },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'invalid_assignee')
})

Deno.test('task assignment: manager unassigns task', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'update_task',
    arguments: {
      task_id: ids.taskIds[0],
      version: 3,
      assign_to: '',
    },
  })
  assertEquals(isToolError(body), false, `unassign: ${JSON.stringify(body)}`)
  const task = extractToolResult(body) as Record<string, unknown>
  assertEquals(task.assigned_to_agent_key_id, null)
})

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════

Deno.test('subscribe: manager creates webhook subscription', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'subscribe',
    arguments: {
      action: 'create',
      project: ids.projectSlug,
      url: 'https://example.com/webhook',
      event_types: ['task.created', 'task.completed'],
    },
  })
  assertEquals(isToolError(body), false, `subscribe create: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertExists(result.id)
  assertExists(result.secret)
  assertEquals(result.is_active, true)
  ids.webhookId = result.id as string
  cleanup.webhooks.push(ids.webhookId)
})

Deno.test('subscribe: manager lists subscriptions', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'subscribe',
    arguments: { action: 'list' },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { subscriptions: Array<Record<string, unknown>> }
  const found = result.subscriptions.find((s) => s.id === ids.webhookId)
  assertExists(found, 'Created subscription should be in list')
})

Deno.test('subscribe: rejects non-HTTPS URL', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'subscribe',
    arguments: {
      action: 'create',
      project: ids.projectSlug,
      url: 'http://insecure.example.com/hook',
      event_types: ['task.created'],
    },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'validation_error')
})

Deno.test('subscribe: rejects invalid event type', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'subscribe',
    arguments: {
      action: 'create',
      project: ids.projectSlug,
      url: 'https://example.com/hook',
      event_types: ['task.explode'],
    },
  })
  assertEquals(isToolError(body), true)
})

Deno.test('subscribe: manager deletes subscription', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'subscribe',
    arguments: { action: 'delete', subscription_id: ids.webhookId },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.deleted, ids.webhookId)
  // Remove from cleanup since it's already deleted
  cleanup.webhooks = cleanup.webhooks.filter((id) => id !== ids.webhookId)
})

// ═══════════════════════════════════════════════════════════════════
// PROJECT LIFECYCLE (RENAME + ARCHIVE)
// ═══════════════════════════════════════════════════════════════════

Deno.test('manage_projects: rename project', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_projects',
    arguments: {
      action: 'rename',
      project_id: ids.projectId,
      name: 'E2E Behavior Renamed',
    },
  })
  assertEquals(isToolError(body), false, `rename project: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.name, 'E2E Behavior Renamed')
  assertExists(result.slug)
  ids.projectSlug = result.slug as string
})

// ═══════════════════════════════════════════════════════════════════
// DEPARTMENT LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

Deno.test('manage_departments: rename department', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_departments',
    arguments: {
      action: 'rename',
      department_id: ids.departmentId,
      name: 'E2E Platform Team',
    },
  })
  assertEquals(isToolError(body), false, `rename dept: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.name, 'E2E Platform Team')
})

Deno.test('manage_departments: archive department', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_departments',
    arguments: {
      action: 'archive',
      department_id: ids.departmentId,
    },
  })
  assertEquals(isToolError(body), false, `archive dept: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.is_archived, true)
})

// ═══════════════════════════════════════════════════════════════════
// KEY ROTATION
// ═══════════════════════════════════════════════════════════════════

Deno.test('manage_agent_keys: rotate worker key and verify old key fails', async () => {
  // Create a disposable worker for rotation test
  const { body: createBody } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'create', name: 'e2e-rotate-target' },
  })
  assertEquals(isToolError(createBody), false, `create key: ${JSON.stringify(createBody)}`)
  const created = extractToolResult(createBody) as Record<string, unknown>
  const oldKey = created.full_key as string
  const targetKeyId = created.key_id as string
  cleanup.agentKeys.push(targetKeyId)

  // Grant permissions so we can verify auth works
  await grantPermsViaRest(targetKeyId, ids.projectId, { can_read: true })

  // Verify old key works
  const { status: okStatus } = await mcpCall(oldKey, 'tools/list')
  assertEquals(okStatus, 200)

  // Rotate the key
  const { body: rotateBody } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'rotate', key_id: targetKeyId },
  })
  assertEquals(isToolError(rotateBody), false, `rotate: ${JSON.stringify(rotateBody)}`)
  const rotated = extractToolResult(rotateBody) as Record<string, unknown>
  const newKey = rotated.full_key as string

  // Verify old key is rejected
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${oldKey}`,
    },
    body: JSON.stringify(jsonrpc('tools/list')),
  })
  assertEquals(res.status, 401, 'Old key should be rejected after rotation')
  await res.text()

  // Verify new key works
  const { status: newStatus } = await mcpCall(newKey, 'tools/list')
  assertEquals(newStatus, 200, 'New key should work after rotation')
})

// ═══════════════════════════════════════════════════════════════════
// KEY DEACTIVATION
// ═══════════════════════════════════════════════════════════════════

Deno.test('manage_agent_keys: deactivate key prevents auth', async () => {
  // Create a disposable worker
  const disposableKey = await createKeyViaRest('e2e-deactivate-target', 'worker')
  await grantPermsViaRest(disposableKey.keyId, ids.projectId, { can_read: true })

  // Verify works
  const { status: okStatus } = await mcpCall(disposableKey.fullKey, 'tools/list')
  assertEquals(okStatus, 200)

  // Deactivate via MCP
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'deactivate', key_id: disposableKey.keyId },
  })
  assertEquals(isToolError(body), false, `deactivate: ${JSON.stringify(body)}`)

  // Verify deactivated key returns 403
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${disposableKey.fullKey}`,
    },
    body: JSON.stringify(jsonrpc('tools/list')),
  })
  assertEquals(res.status, 403)
  await res.text()
})

// ═══════════════════════════════════════════════════════════════════
// SELF-MODIFICATION DENIED
// ═══════════════════════════════════════════════════════════════════

Deno.test('manage_agent_keys: manager cannot deactivate self', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'deactivate', key_id: keys.manager!.keyId },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'self_modification_denied')
})

Deno.test('manage_agent_keys: manager cannot rotate own key', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'manage_agent_keys',
    arguments: { action: 'rotate', key_id: keys.manager!.keyId },
  })
  assertEquals(isToolError(body), true)
  const result = extractToolResult(body) as Record<string, unknown>
  assertEquals(result.code, 'self_modification_denied')
})

// ═══════════════════════════════════════════════════════════════════
// PROVENANCE AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════════

Deno.test('get_provenance: shows events for admin actions', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'get_provenance',
    arguments: {
      project: ids.projectSlug,
      event_category: 'admin',
    },
  })
  assertEquals(isToolError(body), false, `provenance admin: ${JSON.stringify(body)}`)
  const result = extractToolResult(body) as { events: Array<Record<string, unknown>> }
  assertEquals(result.events.length >= 1, true, 'Should have admin events (project created, renamed, etc.)')
})

Deno.test('get_provenance: shows task events with correct actor', async () => {
  const { body } = await mcpCall(keys.manager!.fullKey, 'tools/call', {
    name: 'get_provenance',
    arguments: {
      project: ids.projectSlug,
      target_type: 'task',
    },
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as { events: Array<Record<string, unknown>> }
  assertEquals(result.events.length >= 1, true)
  // Verify events have actor info
  const event = result.events[0]
  assertExists(event.actor_type)
  assertExists(event.actor_id)
})

// ═══════════════════════════════════════════════════════════════════
// INFO TOOL REFLECTS PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

Deno.test('info: worker A sees correct permission scopes', async () => {
  const { body } = await mcpCall(keys.workerA!.fullKey, 'tools/call', {
    name: 'info',
    arguments: {},
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as Record<string, unknown>
  const perms = result.permissions as Record<string, unknown>
  const scopes = perms.scopes as Array<Record<string, unknown>>
  assertEquals(scopes.length >= 1, true)
  const scope = scopes.find((s) => s.project === ids.projectSlug)
  assertExists(scope, `Worker A should see project ${ids.projectSlug} in scopes`)
  assertEquals(scope!.can_read, true)
  assertEquals(scope!.can_create, true)
  assertEquals(scope!.can_update, true)
  assertEquals(scope!.can_assign, false)
})

Deno.test('info: worker B has read-only scopes', async () => {
  const { body } = await mcpCall(keys.workerB!.fullKey, 'tools/call', {
    name: 'info',
    arguments: {},
  })
  assertEquals(isToolError(body), false)
  const result = extractToolResult(body) as Record<string, unknown>
  const perms = result.permissions as Record<string, unknown>
  const scopes = perms.scopes as Array<Record<string, unknown>>
  const scope = scopes.find((s) => s.project === ids.projectSlug)
  assertExists(scope)
  assertEquals(scope!.can_read, true)
  assertEquals(scope!.can_create, false)
  assertEquals(scope!.can_update, false)
})

// ═══════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════

Deno.test({
  name: 'cleanup: remove all test data',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Webhooks
    for (const id of cleanup.webhooks) {
      await supabaseRest('webhook_subscriptions', { method: 'DELETE', query: `id=eq.${id}` })
    }

    // Tasks
    for (const id of cleanup.tasks) {
      await supabaseRest('tasks', { method: 'DELETE', query: `id=eq.${id}` })
    }

    // Permissions (for all keys, not just tracked ones — covers MCP-created keys)
    for (const id of cleanup.agentKeys) {
      await supabaseRest('agent_permissions', { method: 'DELETE', query: `agent_key_id=eq.${id}` })
    }
    for (const id of cleanup.permissions) {
      await supabaseRest('agent_permissions', { method: 'DELETE', query: `id=eq.${id}` })
    }

    // Rate limits and request logs for test keys
    for (const id of cleanup.agentKeys) {
      await supabaseRest('rate_limits', { method: 'DELETE', query: `agent_key_id=eq.${id}` })
      await supabaseRest('request_log', { method: 'DELETE', query: `agent_key_id=eq.${id}` })
    }

    // Agent keys
    for (const id of cleanup.agentKeys) {
      await supabaseRest('agent_keys', { method: 'DELETE', query: `id=eq.${id}` })
    }

    // Departments
    for (const id of cleanup.departments) {
      await supabaseRest('departments', { method: 'DELETE', query: `id=eq.${id}` })
    }

    // Projects
    for (const id of cleanup.projects) {
      await supabaseRest('projects', { method: 'DELETE', query: `id=eq.${id}` })
    }
  },
})
