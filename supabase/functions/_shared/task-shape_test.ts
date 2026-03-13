import { assertEquals } from '@std/assert'
import { compactTask, compactTasks, buildSlugMaps } from './task-shape.ts'
import type { AgentPermission } from './types.ts'

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

const MOCK_PERMS: AgentPermission[] = [
  {
    id: 'perm-1', projectId: 'proj-1', projectSlug: 'testproject', projectName: 'TestProject',
    isProjectArchived: false,
    departmentId: 'dept-1', departmentSlug: 'core', departmentName: 'Core', isDepartmentArchived: false,
    canRead: true, canCreate: true, canUpdate: true, canAssign: false, canComment: false, canArchive: false,
  },
]

Deno.test('compactTask keeps exactly 9 fields', () => {
  const result = compactTask(FULL_TASK)
  assertEquals(Object.keys(result).length, 9)
  assertEquals(Object.keys(result).sort(), [
    'created_at', 'department', 'description', 'due_date', 'id',
    'priority', 'status', 'updated_at', 'version',
  ])
})

Deno.test('compactTask replaces department_id with slug when slugs provided', () => {
  const slugs = buildSlugMaps(MOCK_PERMS)
  const result = compactTask(FULL_TASK, slugs)
  assertEquals(result.department, 'core')
})

Deno.test('compactTask falls back to raw department_id without slugs', () => {
  const result = compactTask(FULL_TASK)
  assertEquals(result.department, 'dept-1')
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
  assertEquals('department_id' in result, false)
  assertEquals('project_id' in result, false)
})

Deno.test('compactTask defaults missing keys to null', () => {
  const minimal = { id: 'x', version: 1, status: 'todo', priority: 'low', description: 'hi' }
  const result = compactTask(minimal)
  assertEquals(result.due_date, null)
  assertEquals(result.updated_at, null)
  assertEquals(result.created_at, null)
  assertEquals(result.department, null)
})

Deno.test('compactTasks maps correctly over array', () => {
  const slugs = buildSlugMaps(MOCK_PERMS)
  const tasks = [FULL_TASK, { ...FULL_TASK, id: 'id-2', description: 'Second' }]
  const result = compactTasks(tasks, slugs)
  assertEquals(result.length, 2)
  assertEquals(Object.keys(result[0]).length, 9)
  assertEquals(result[0].department, 'core')
  assertEquals(result[1].description, 'Second')
  assertEquals('notes' in result[0], false)
})

Deno.test('buildSlugMaps builds correct lookups', () => {
  const slugs = buildSlugMaps(MOCK_PERMS)
  assertEquals(slugs.projects.get('proj-1'), 'testproject')
  assertEquals(slugs.departments.get('dept-1'), 'core')
  assertEquals(slugs.projects.size, 1)
  assertEquals(slugs.departments.size, 1)
})
