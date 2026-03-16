import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  scopeNotAllowedError,
  taskNotFoundError,
  validationError,
  versionConflictError,
  internalError,
} from '../../_shared/errors.ts'
import { validateTaskInput } from '../../_shared/validation.ts'
import { parseRpcErrorCode, parseVersionFromError } from '../../_shared/rpc-errors.ts'
import { resolveDepartment } from '../../_shared/department-resolver.ts'

interface UpdateTaskParams {
  task_id: string
  version: number
  priority?: string
  description?: string
  notes?: string
  department?: string
  due_date?: string
  status?: string
  is_archived?: boolean
}

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
    .eq('workspace_id', ctx.workspaceId)
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

  // 2b. Determine effective permission for the task's CURRENT department scope
  let effectiveCanUpdate = false
  let effectiveCanComment = false

  if (existingTask.department_id) {
    // Task is in a specific department — check dept-level permissions
    const hasProjectWideUpdate = projectPerms.some((p) => p.departmentId === null && p.canUpdate)
    const hasDeptUpdate = projectPerms.some(
      (p) => p.departmentId === existingTask.department_id && p.canUpdate
    )
    effectiveCanUpdate = hasProjectWideUpdate || hasDeptUpdate

    const hasProjectWideComment = projectPerms.some((p) => p.departmentId === null && p.canComment)
    const hasDeptComment = projectPerms.some(
      (p) => p.departmentId === existingTask.department_id && p.canComment
    )
    effectiveCanComment = hasProjectWideComment || hasDeptComment
  } else {
    // Task has no department — project-level check
    effectiveCanUpdate = projectPerms.some((p) => p.canUpdate)
    effectiveCanComment = projectPerms.some((p) => p.canComment)
  }

  if (!effectiveCanUpdate && !effectiveCanComment) {
    return mcpError(scopeNotAllowedError(projectPerms[0].projectSlug, 'update'))
  }

  // If only can_comment (not can_update) for this scope, restrict fields
  if (!effectiveCanUpdate && effectiveCanComment) {
    const restrictedFields = ['priority', 'description', 'department', 'due_date', 'is_archived'] as const
    const attempted = restrictedFields.filter((f) => params[f] !== undefined)
    if (attempted.length > 0) {
      return mcpError({
        code: 'scope_not_allowed',
        message: `Comment-only permission: cannot change ${attempted.join(', ')}. Only notes and status are allowed.`,
        recovery: 'Remove restricted fields and retry with only notes and/or status.',
      })
    }
  }

  // 3b. Archive permission check: is_archived requires canArchive (separate from canUpdate)
  if (params.is_archived !== undefined) {
    let effectiveCanArchive: boolean
    if (existingTask.department_id) {
      effectiveCanArchive =
        projectPerms.some((p) => p.departmentId === null && p.canArchive) ||
        projectPerms.some((p) => p.departmentId === existingTask.department_id && p.canArchive)
    } else {
      effectiveCanArchive = projectPerms.some((p) => p.departmentId === null && p.canArchive)
    }
    if (!effectiveCanArchive) {
      return mcpError({
        code: 'scope_not_allowed',
        message: 'Archive permission required to change is_archived.',
        recovery: 'Request can_archive permission from an admin.',
      })
    }
  }

  // 4. Cross-scope department move
  let newDepartmentId: string | null | undefined = undefined
  if (params.department !== undefined) {
    const projectSlug = projectPerms[0].projectSlug
    const result = await resolveDepartment(params.department, projectPerms, supabase, 'update', projectSlug, ctx.workspaceId)
    if ('error' in result) {
      return mcpError(result.error)
    }

    // Extra check: if resolved via dept-specific perm, verify canCreate || canUpdate
    const destDeptPerm = projectPerms.find((p) => p.departmentId === result.departmentId)
    if (destDeptPerm && !destDeptPerm.canUpdate) {
      return mcpError(scopeNotAllowedError(projectSlug, 'update'))
    }

    // Only set newDepartmentId if it's actually different
    if (result.departmentId !== existingTask.department_id) {
      newDepartmentId = result.departmentId
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
  if (params.is_archived !== undefined) fields.is_archived = params.is_archived

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
        return mcpError(internalError(rpcError.message))
    }
  }

  // 8. Return updated task
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
  }
}
