import type { AgentPermission } from './types.ts'

/**
 * A permission grant row — the subset of fields needed for dominance checks.
 */
export interface PermissionGrant {
  project_id?: string
  department_id?: string
  can_read?: boolean
  can_create?: boolean
  can_update?: boolean
  can_assign?: boolean
}

/**
 * Check if a single manager permission row dominates a granted row.
 * Combining across rows is NOT allowed — one row must fully cover the grant.
 *
 * Dominance rules:
 * - Must be same project
 * - Manager dept must be NULL (whole project) or same as granted dept
 * - Manager actions must be a superset of granted actions
 */
export function checkDominance(managerPerms: AgentPermission[], grantedRow: PermissionGrant): boolean {
  return managerPerms.some((mp) => {
    // Must be same project
    if (mp.projectId !== grantedRow.project_id) return false
    // Manager dept must be NULL (whole project) or same as granted dept
    if (mp.departmentId !== null && mp.departmentId !== (grantedRow.department_id ?? null)) return false
    // Manager actions must be superset
    if (grantedRow.can_read && !mp.canRead) return false
    if (grantedRow.can_create && !mp.canCreate) return false
    if (grantedRow.can_update && !mp.canUpdate) return false
    if (grantedRow.can_assign && !mp.canAssign) return false
    return true
  })
}

/**
 * Check if an agent has a specific action for a given project.
 * Used by tool handlers to verify scope access.
 */
export function checkToolScope(
  permissions: AgentPermission[],
  projectId: string,
  action: 'read' | 'create' | 'update' | 'assign',
  departmentId?: string | null,
): boolean {
  const projectPerms = permissions.filter((p) => p.projectId === projectId && !p.isProjectArchived)

  if (projectPerms.length === 0) return false

  return projectPerms.some((p) => {
    // Check department scope
    if (departmentId) {
      if (p.departmentId !== null && p.departmentId !== departmentId) return false
    }

    // Check action
    switch (action) {
      case 'read': return p.canRead
      case 'create': return p.canCreate
      case 'update': return p.canUpdate
      case 'assign': return p.canAssign
    }
  })
}
