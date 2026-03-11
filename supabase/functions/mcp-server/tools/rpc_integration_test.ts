import { assertEquals, assertStringIncludes } from '@std/assert'
import { createTestContext, MockQueryBuilder } from '../../_shared/test-utils.ts'
import { handleAddTask } from './add-task.ts'
import { handleUpdateTask } from './update-task.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

function getResponseText(result: { content: { text: string }[] }): string {
  return result.content[0].text
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true
}

// ── add-task via RPC ─────────────────────────────────────────────────

Deno.test('add-task: RPC returns created task with version=1', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true }],
  })
  const mock = new MockQueryBuilder()

  // First call: app_settings check (department not required)
  // Second call: rpc('create_task_with_event') → returns task
  const createdTask = {
    id: 'task-uuid-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'medium',
    description: 'Test task',
    notes: null,
    due_date: null,
    status: 'todo',
    version: 1,
    created_at: '2025-01-01T00:00:00Z',
  }
  mock.setResponse(createdTask)

  const result = await handleAddTask(
    { project: 'my-project', description: 'Test task' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), false)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.version, 1)
  assertEquals(parsed.id, 'task-uuid-1')
})

Deno.test('add-task: RPC project_not_found returns proper error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true }],
  })
  const mock = new MockQueryBuilder()
  mock.setResponse(null, { message: 'project_not_found:Project not found' })

  const result = await handleAddTask(
    { project: 'my-project', description: 'Test task' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'invalid_project')
})

Deno.test('add-task: RPC department_archived returns proper error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true }],
  })
  const mock = new MockQueryBuilder()
  mock.setResponse(null, { message: 'department_archived:Cannot create tasks in an archived department' })

  const result = await handleAddTask(
    { project: 'my-project', description: 'Test task' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'invalid_department')
})

// ── update-task via RPC ──────────────────────────────────────────────

Deno.test('update-task: RPC returns task with incremented version', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canUpdate: true }],
  })
  const mock = new MockQueryBuilder()

  const existingTask = {
    id: 'task-uuid-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'medium',
    description: 'Old description',
    notes: null,
    due_date: null,
    status: 'todo',
    version: 1,
  }
  const updatedTask = { ...existingTask, description: 'New description', version: 2 }

  // Mock returns existingTask for the pre-fetch, then updatedTask for the RPC
  let callCount = 0
  mock.single = () => {
    callCount++
    if (callCount === 1) {
      return Promise.resolve({ data: existingTask, error: null })
    }
    return Promise.resolve({ data: updatedTask, error: null })
  }

  const result = await handleUpdateTask(
    { task_id: 'task-uuid-1', version: 1, description: 'New description' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), false)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.version, 2)
  assertEquals(parsed.description, 'New description')
})

Deno.test('update-task: RPC version_conflict returns error with current version', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canUpdate: true }],
  })
  const mock = new MockQueryBuilder()

  const existingTask = {
    id: 'task-uuid-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'medium',
    description: 'Some task',
    notes: null,
    due_date: null,
    status: 'todo',
    version: 3,
  }

  let callCount = 0
  mock.single = () => {
    callCount++
    if (callCount === 1) {
      return Promise.resolve({ data: existingTask, error: null })
    }
    return Promise.resolve({ data: null, error: { message: 'version_conflict:Version conflict: expected 1, current is 3' } })
  }

  const result = await handleUpdateTask(
    { task_id: 'task-uuid-1', version: 1, description: 'Updated' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'version_conflict')
  assertEquals(parsed.current_version, 3)
})

Deno.test('update-task: RPC task_not_found returns proper error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canUpdate: true }],
  })
  const mock = new MockQueryBuilder()

  // Pre-fetch finds the task (for authorization)
  const existingTask = {
    id: 'task-uuid-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'medium',
    description: 'Task',
    notes: null,
    due_date: null,
    status: 'todo',
    version: 1,
  }

  let callCount = 0
  mock.single = () => {
    callCount++
    if (callCount === 1) {
      return Promise.resolve({ data: existingTask, error: null })
    }
    return Promise.resolve({ data: null, error: { message: 'task_not_found:Task not found' } })
  }

  const result = await handleUpdateTask(
    { task_id: 'task-uuid-1', version: 1, status: 'done' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  assertStringIncludes(getResponseText(result), 'task_not_found')
})
