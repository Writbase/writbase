import { assertEquals } from '@std/assert'
import { compactTask, compactTasks } from './task-shape.ts'

const FULL_TASK = {
  id: '00000000-0000-0000-0000-000000000001',
  version: 3,
  status: 'in_progress',
  priority: 'high',
  description: 'Fix the widget',
  due_date: '2026-04-01',
  updated_at: '2026-03-13T10:00:00Z',
  created_at: '2026-03-01T08:00:00Z',
  notes: 'Some notes here',
  workspace_id: 'ws-1',
  project_id: 'proj-1',
  department_id: 'dept-1',
  assigned_to_agent_key_id: 'key-1',
  requested_by_agent_key_id: 'key-2',
  delegation_depth: 0,
  assignment_chain: [],
  search_vector: 'tsvector stuff',
  is_archived: false,
}

Deno.test('compactTask keeps exactly 9 fields', () => {
  const result = compactTask(FULL_TASK)
  assertEquals(Object.keys(result).length, 9)
  assertEquals(Object.keys(result).sort(), [
    'created_at', 'department_id', 'description', 'due_date', 'id',
    'priority', 'status', 'updated_at', 'version',
  ])
})

Deno.test('compactTask preserves null values', () => {
  const task = { ...FULL_TASK, due_date: null }
  const result = compactTask(task)
  assertEquals(result.due_date, null)
})

Deno.test('compactTask drops non-compact fields', () => {
  const result = compactTask(FULL_TASK)
  assertEquals('notes' in result, false)
  assertEquals('workspace_id' in result, false)
  assertEquals('search_vector' in result, false)
  assertEquals('assigned_to_agent_key_id' in result, false)
})

Deno.test('compactTask defaults missing keys to null', () => {
  const minimal = { id: 'x', version: 1, status: 'todo', priority: 'low', description: 'hi' }
  const result = compactTask(minimal)
  assertEquals(result.due_date, null)
  assertEquals(result.updated_at, null)
  assertEquals(result.created_at, null)
})

Deno.test('compactTasks maps correctly over array', () => {
  const tasks = [FULL_TASK, { ...FULL_TASK, id: 'id-2', description: 'Second' }]
  const result = compactTasks(tasks)
  assertEquals(result.length, 2)
  assertEquals(Object.keys(result[0]).length, 9)
  assertEquals(result[1].description, 'Second')
  assertEquals('notes' in result[0], false)
})
