import { assertEquals } from '@std/assert'
import { checkDominance, checkToolScope, type PermissionGrant } from './permissions.ts'
import type { AgentPermission } from './types.ts'

function makePerm(overrides: Partial<AgentPermission> = {}): AgentPermission {
  return {
    id: 'perm-1',
    projectId: 'proj-1',
    projectSlug: 'my-project',
    projectName: 'My Project',
    departmentId: null,
    departmentSlug: null,
    departmentName: null,
    canRead: true,
    canCreate: true,
    canUpdate: true,
    isProjectArchived: false,
    isDepartmentArchived: null,
    ...overrides,
  }
}

// --- checkDominance tests ---

Deno.test('checkDominance: manager with full project perms dominates worker grant', () => {
  const managerPerms = [makePerm()]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    can_read: true,
    can_create: false,
    can_update: false,
  }
  assertEquals(checkDominance(managerPerms, grant), true)
})

Deno.test('checkDominance: manager with full perms dominates dept-scoped grant', () => {
  const managerPerms = [makePerm({ departmentId: null })]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    department_id: 'dept-1',
    can_read: true,
    can_create: true,
    can_update: false,
  }
  assertEquals(checkDominance(managerPerms, grant), true)
})

Deno.test('checkDominance: manager missing dept does not dominate dept-scoped grant', () => {
  const managerPerms = [makePerm({ departmentId: 'dept-2' })]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    department_id: 'dept-1',
    can_read: true,
  }
  assertEquals(checkDominance(managerPerms, grant), false)
})

Deno.test('checkDominance: subset constraint — canCreate+canUpdate not dominated if manager only has canRead', () => {
  const managerPerms = [makePerm({ canRead: true, canCreate: false, canUpdate: false })]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    can_read: true,
    can_create: true,
    can_update: true,
  }
  assertEquals(checkDominance(managerPerms, grant), false)
})

Deno.test('checkDominance: null department in grant, non-null in manager perms — should fail', () => {
  const managerPerms = [makePerm({ departmentId: 'dept-1' })]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    // department_id omitted — means project-wide
    can_read: true,
  }
  // Manager has dept-1 scope only, cannot grant project-wide
  assertEquals(checkDominance(managerPerms, grant), false)
})

Deno.test('checkDominance: wrong project returns false', () => {
  const managerPerms = [makePerm({ projectId: 'proj-1' })]
  const grant: PermissionGrant = {
    project_id: 'proj-2',
    can_read: true,
  }
  assertEquals(checkDominance(managerPerms, grant), false)
})

Deno.test('checkDominance: multiple manager perms — one matching is enough', () => {
  const managerPerms = [
    makePerm({ projectId: 'proj-1', departmentId: 'dept-1', canCreate: false }),
    makePerm({ projectId: 'proj-1', departmentId: null }),
  ]
  const grant: PermissionGrant = {
    project_id: 'proj-1',
    department_id: 'dept-2',
    can_read: true,
    can_create: true,
    can_update: true,
  }
  // Second manager perm is project-wide with full actions → dominates
  assertEquals(checkDominance(managerPerms, grant), true)
})

// --- checkToolScope tests ---

Deno.test('checkToolScope: agent with read permission can read', () => {
  const perms = [makePerm({ canRead: true, canCreate: false, canUpdate: false })]
  assertEquals(checkToolScope(perms, 'proj-1', 'read'), true)
})

Deno.test('checkToolScope: agent without create permission cannot create', () => {
  const perms = [makePerm({ canRead: true, canCreate: false, canUpdate: false })]
  assertEquals(checkToolScope(perms, 'proj-1', 'create'), false)
})

Deno.test('checkToolScope: archived project returns false', () => {
  const perms = [makePerm({ isProjectArchived: true })]
  assertEquals(checkToolScope(perms, 'proj-1', 'read'), false)
})

Deno.test('checkToolScope: dept-scoped perm does not grant access to different dept', () => {
  const perms = [makePerm({ departmentId: 'dept-1' })]
  assertEquals(checkToolScope(perms, 'proj-1', 'read', 'dept-2'), false)
})

Deno.test('checkToolScope: project-wide perm grants access to any dept', () => {
  const perms = [makePerm({ departmentId: null })]
  assertEquals(checkToolScope(perms, 'proj-1', 'read', 'dept-2'), true)
})
