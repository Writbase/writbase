import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentPermission } from './types.ts'
import type { WritBaseError } from './errors.ts'
import { invalidDepartmentError, scopeNotAllowedError } from './errors.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RequiredAction = 'read' | 'create' | 'update'

function hasAction(perm: AgentPermission, action: RequiredAction): boolean {
  switch (action) {
    case 'read': return perm.canRead
    case 'create': return perm.canCreate
    case 'update': return perm.canCreate || perm.canUpdate
  }
}

export async function resolveDepartment(
  departmentInput: string,
  projectPerms: AgentPermission[],
  supabase: SupabaseClient,
  requiredAction: RequiredAction,
  projectLabel: string,
): Promise<{ departmentId: string } | { error: WritBaseError }> {
  const isDeptUuid = UUID_RE.test(departmentInput)

  const hasProjectWide = projectPerms.some((p) => p.departmentId === null && hasAction(p, requiredAction))
  const deptPerm = projectPerms.find((p) =>
    isDeptUuid
      ? p.departmentId === departmentInput
      : p.departmentSlug === departmentInput
  )

  if (!hasProjectWide && !deptPerm) {
    return { error: scopeNotAllowedError(projectLabel, requiredAction === 'update' ? 'update' : requiredAction) }
  }

  if (deptPerm) {
    if (deptPerm.isDepartmentArchived) {
      return { error: invalidDepartmentError(departmentInput) }
    }
    return { departmentId: deptPerm.departmentId! }
  }

  const column = isDeptUuid ? 'id' : 'slug'
  const { data: dept } = await supabase
    .from('departments')
    .select('id, is_archived')
    .eq(column, departmentInput)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (!dept || dept.is_archived) {
    return { error: invalidDepartmentError(departmentInput) }
  }
  return { departmentId: dept.id }
}
