import { assertEquals, assertStringIncludes } from '@std/assert'
import { createTestContext, MockQueryBuilder } from '../../_shared/test-utils.ts'
import { handleManageAgentPermissions } from './manage-agent-permissions.ts'
import { handleGetTasks } from './get-tasks.ts'
import { handleInfo } from './info.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

// Helper to extract the text content from an MCP response
function getResponseText(result: { content: { text: string }[] }): string {
  return result.content[0].text
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true
}

// --- Worker cannot access manager tools ---

Deno.test('authorization: worker cannot access manage_agent_permissions', async () => {
  const ctx = createTestContext({ role: 'worker' })
  const mock = new MockQueryBuilder()
  const result = await handleManageAgentPermissions(
    { action: 'list', key_id: 'some-key' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'insufficient')
})

// --- Agent can only see tasks in permitted projects ---

Deno.test('authorization: agent cannot get tasks from unpermitted project', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'allowed-project', canRead: true }],
  })
  const mock = new MockQueryBuilder()
  const result = await handleGetTasks(
    { project: 'forbidden-project' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'invalid_project')
})

// --- Agent can't update tasks without canUpdate ---

Deno.test('authorization: agent without canRead cannot get tasks', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: false, canCreate: true }],
  })
  const mock = new MockQueryBuilder()
  const result = await handleGetTasks(
    { project: 'my-project' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'scope_not_allowed')
})

// --- Info tool returns correct scopes ---

Deno.test('authorization: info tool returns agent scopes', async () => {
  const ctx = createTestContext({
    name: 'test-bot',
    role: 'worker',
    permissions: [
      { projectSlug: 'proj-a', canRead: true, canCreate: false, canUpdate: false },
    ],
  })
  const mock = new MockQueryBuilder()
  mock.setResponse({ department_required: false })
  const result = await handleInfo(ctx, mock as unknown as SupabaseClient)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.agent.name, 'test-bot')
  assertEquals(parsed.agent.role, 'worker')
  assertEquals(parsed.permissions.scopes.length, 1)
  assertEquals(parsed.permissions.scopes[0].can_read, true)
  assertEquals(parsed.permissions.scopes[0].can_create, false)
})

// --- Cross-project access denied ---

Deno.test('authorization: manager cannot grant perms for project they lack', async () => {
  const ctx = createTestContext({
    role: 'manager',
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project' }],
  })
  const mock = new MockQueryBuilder()
  const result = await handleManageAgentPermissions(
    {
      action: 'grant',
      key_id: 'other-key',
      permissions: [{ project_id: 'proj-2', can_read: true }],
    },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'insufficient')
})

// --- Self-modification denied ---

Deno.test('authorization: manager cannot grant perms to self', async () => {
  const ctx = createTestContext({
    keyId: 'my-key-id',
    role: 'manager',
    permissions: [{ projectId: 'proj-1' }],
  })
  const mock = new MockQueryBuilder()
  const result = await handleManageAgentPermissions(
    {
      action: 'grant',
      key_id: 'my-key-id',
      permissions: [{ project_id: 'proj-1', can_read: true }],
    },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'self')
})
