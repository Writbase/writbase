import { assertEquals, assertStringIncludes } from '@std/assert'
import { createTestContext, MockQueryBuilder } from '../../_shared/test-utils.ts'
import { handleAddTask } from './add-task.ts'
import { handleUpdateTask } from './update-task.ts'
import { handleGetTasks } from './get-tasks.ts'
import { encodeCursor } from '../../_shared/pagination.ts'
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

// ── add-task additional tests ──────────────────────────────────────────

Deno.test('add-task: permission denied when agent has canRead but not canCreate', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: true, canCreate: false }],
  })
  const mock = new MockQueryBuilder()

  const result = await handleAddTask(
    { project: 'my-project', description: 'Test task' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'scope_not_allowed')
  assertStringIncludes(parsed.message, 'create')
})

Deno.test('add-task: project archived returns invalid_project error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true, isProjectArchived: true }],
  })
  const mock = new MockQueryBuilder()

  const result = await handleAddTask(
    { project: 'my-project', description: 'Test task' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'invalid_project')
  assertStringIncludes(parsed.message, 'archived')
})

Deno.test('add-task: empty description returns validation_error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true }],
  })
  const mock = new MockQueryBuilder()

  // app_settings check returns department_required: false
  mock.setResponse({ department_required: false })

  const result = await handleAddTask(
    { project: 'my-project', description: '' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'validation_error')
  assertEquals(typeof parsed.fields?.description, 'string')
})

Deno.test('add-task: department required by app_settings with no department param returns validation_error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canCreate: true }],
  })
  const mock = new MockQueryBuilder()

  // app_settings returns department_required: true
  mock.setResponse({ department_required: true })

  const result = await handleAddTask(
    { project: 'my-project', description: 'Valid task description' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'validation_error')
  assertEquals(typeof parsed.fields?.department, 'string')
})

// ── update-task additional tests ───────────────────────────────────────

Deno.test('update-task: task not in agent scope returns task_not_found', async () => {
  // Agent only has permission for proj-2, but the task belongs to proj-1
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-2', projectSlug: 'other-project', canUpdate: true }],
  })
  const mock = new MockQueryBuilder()

  const existingTask = {
    id: 'task-uuid-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'medium',
    description: 'Task in different project',
    notes: null,
    due_date: null,
    status: 'todo',
    version: 1,
  }

  // Pre-fetch returns the task (DB doesn't enforce agent scope)
  mock.single = () => Promise.resolve({ data: existingTask, error: null })

  const result = await handleUpdateTask(
    { task_id: 'task-uuid-1', version: 1, description: 'Updated' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'task_not_found')
})

Deno.test('update-task: no update permission returns scope_not_allowed', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: true, canUpdate: false }],
  })
  const mock = new MockQueryBuilder()

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

  mock.single = () => Promise.resolve({ data: existingTask, error: null })

  const result = await handleUpdateTask(
    { task_id: 'task-uuid-1', version: 1, description: 'Updated' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'scope_not_allowed')
  assertStringIncludes(parsed.message, 'update')
})

// ── get-tasks tests ────────────────────────────────────────────────────

Deno.test('get-tasks: success returns tasks array with proper structure', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: true }],
  })
  const mock = new MockQueryBuilder()

  const tasks = [
    {
      id: 'task-1',
      project_id: 'proj-1',
      department_id: null,
      priority: 'medium',
      description: 'First task',
      status: 'todo',
      version: 1,
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'task-2',
      project_id: 'proj-1',
      department_id: null,
      priority: 'high',
      description: 'Second task',
      status: 'in_progress',
      version: 2,
      created_at: '2025-01-02T00:00:00Z',
    },
  ]
  mock.setResponse(tasks)

  const result = await handleGetTasks(
    { project: 'my-project' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), false)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(Array.isArray(parsed.tasks), true)
  assertEquals(parsed.tasks.length, 2)
  assertEquals(parsed.tasks[0].id, 'task-1')
  assertEquals(parsed.tasks[1].id, 'task-2')
})

Deno.test('get-tasks: invalid project not in agent permissions returns invalid_project', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: true }],
  })
  const mock = new MockQueryBuilder()

  const result = await handleGetTasks(
    { project: 'unknown-project' },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), true)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'invalid_project')
})

Deno.test('get-tasks: no read permission returns scope_not_allowed', async () => {
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
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(parsed.code, 'scope_not_allowed')
  assertStringIncludes(parsed.message, 'read')
})

Deno.test('get-tasks: valid base64 cursor decodes without error', async () => {
  const ctx = createTestContext({
    permissions: [{ projectId: 'proj-1', projectSlug: 'my-project', canRead: true }],
  })
  const mock = new MockQueryBuilder()

  // RPC returns empty array (no more tasks after cursor)
  mock.setResponse([])

  const cursor = encodeCursor('2025-06-01T00:00:00Z', 'task-cursor-id')

  const result = await handleGetTasks(
    { project: 'my-project', cursor },
    ctx,
    mock as unknown as SupabaseClient
  )
  assertEquals(isError(result), false)
  const parsed = JSON.parse(getResponseText(result))
  assertEquals(Array.isArray(parsed.tasks), true)
  assertEquals(parsed.tasks.length, 0)
  assertEquals(parsed.next_cursor, undefined)
})
