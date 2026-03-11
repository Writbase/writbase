import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidDepartmentError,
  scopeNotAllowedError,
  taskNotFoundError,
  validationError,
  versionConflictError,
} from '../../_shared/errors.ts'
import { validateTaskInput } from '../../_shared/validation.ts'
import { parseRpcErrorCode, parseVersionFromError } from '../../_shared/rpc-errors.ts'

interface UpdateTaskParams {
  task_id: string
  version: number
  priority?: string
  description?: string
  notes?: string
  department?: string
  due_date?: string
  status?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleUpdateTask(
  params: UpdateTaskParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  // 1. Fetch task by ID
  const { data: existingTask, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.task_id)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (fetchError || !existingTask) {
    return mcpError(taskNotFoundError(params.task_id))
  }

  // 2. Check task's project is in agent's allowed scopes with can_update
  const projectPerms = ctx.permissions.filter(
    (p) => p.projectId === existingTask.project_id && !p.isProjectArchived
  )

  if (projectPerms.length === 0) {
    return mcpError(taskNotFoundError(params.task_id))
  }

  const hasUpdate = projectPerms.some((p) => p.canUpdate)
  if (!hasUpdate) {
    const projectSlug = projectPerms[0].projectSlug
    return mcpError(scopeNotAllowedError(projectSlug, 'update'))
  }

  // 3. Check task's current department scope — agent needs can_update for it
  if (existingTask.department_id) {
    const hasProjectWideUpdate = projectPerms.some((p) => p.departmentId === null && p.canUpdate)
    const hasDeptUpdate = projectPerms.some(
      (p) => p.departmentId === existingTask.department_id && p.canUpdate
    )

    if (!hasProjectWideUpdate && !hasDeptUpdate) {
      const projectSlug = projectPerms[0].projectSlug
      return mcpError(scopeNotAllowedError(projectSlug, 'update'))
    }
  }

  // 4. Cross-scope department move
  let newDepartmentId: string | null | undefined = undefined
  if (params.department !== undefined) {
    const isDeptUuid = UUID_RE.test(params.department)

    // Resolve destination department
    let destDeptId: string | null = null
    const hasProjectWide = projectPerms.some((p) => p.departmentId === null && (p.canCreate || p.canUpdate))
    const destDeptPerm = projectPerms.find((p) =>
      isDeptUuid
        ? p.departmentId === params.department
        : p.departmentSlug === params.department
    )

    if (!hasProjectWide && !destDeptPerm) {
      const projectSlug = projectPerms[0].projectSlug
      return mcpError(scopeNotAllowedError(projectSlug, 'update'))
    }

    if (destDeptPerm) {
      if (destDeptPerm.isDepartmentArchived) {
        return mcpError(invalidDepartmentError(params.department))
      }
      if (!(destDeptPerm.canCreate || destDeptPerm.canUpdate)) {
        const projectSlug = projectPerms[0].projectSlug
        return mcpError(scopeNotAllowedError(projectSlug, 'update'))
      }
      destDeptId = destDeptPerm.departmentId
    } else {
      // Agent has project-wide access; resolve the department
      if (isDeptUuid) {
        const { data: dept } = await supabase
          .from('departments')
          .select('id, is_archived')
          .eq('id', params.department)
          .abortSignal(AbortSignal.timeout(10_000))
          .single()

        if (!dept || dept.is_archived) {
          return mcpError(invalidDepartmentError(params.department))
        }
        destDeptId = dept.id
      } else {
        const { data: dept } = await supabase
          .from('departments')
          .select('id, is_archived')
          .eq('slug', params.department)
          .abortSignal(AbortSignal.timeout(10_000))
          .single()

        if (!dept || dept.is_archived) {
          return mcpError(invalidDepartmentError(params.department))
        }
        destDeptId = dept.id
      }
    }

    // Only set newDepartmentId if it's actually different
    if (destDeptId !== existingTask.department_id) {
      newDepartmentId = destDeptId
    }
  }

  // 5. Validate changed fields
  const fieldsToValidate: Record<string, unknown> = {}
  if (params.description !== undefined) fieldsToValidate.description = params.description
  if (params.priority !== undefined) fieldsToValidate.priority = params.priority
  if (params.status !== undefined) fieldsToValidate.status = params.status
  if (params.due_date !== undefined) fieldsToValidate.due_date = params.due_date

  const fieldErrors = validateTaskInput(fieldsToValidate)
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // 6. Build fields payload for the RPC (only provided fields)
  const fields: Record<string, unknown> = {}
  if (params.priority !== undefined) fields.priority = params.priority
  if (params.description !== undefined) fields.description = params.description.trim()
  if (params.notes !== undefined) fields.notes = params.notes
  if (params.due_date !== undefined) fields.due_date = params.due_date
  if (params.status !== undefined) fields.status = params.status
  if (newDepartmentId !== undefined) fields.department_id = newDepartmentId

  // 7. Atomic update via RPC (task + field-level event_log in one transaction)
  const { data: updated, error: rpcError } = await supabase
    .rpc('update_task_with_events', {
      p_payload: {
        task_id: params.task_id,
        version: params.version,
        fields,
        actor_type: 'agent',
        actor_id: ctx.keyId,
        actor_label: ctx.name,
        source: 'mcp',
      },
    })
    .single()

  if (rpcError) {
    const code = parseRpcErrorCode(rpcError.message)
    switch (code) {
      case 'task_not_found':
        return mcpError(taskNotFoundError(params.task_id))
      case 'version_conflict': {
        const currentVersion = parseVersionFromError(rpcError.message) ?? existingTask.version
        return mcpError(versionConflictError(currentVersion))
      }
      default:
        return mcpError({
          code: 'internal_error',
          message: rpcError.message,
        })
    }
  }

  // 8. Return updated task
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
  }
}
