import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  scopeNotAllowedError,
  taskNotFoundError,
  validationError,
  versionConflictError,
  invalidAssigneeError,
  circularDelegationError,
  delegationDepthExceededError,
  assignNotAllowedError,
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
  assign_to?: string
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
    const projectSlug = projectPerms[0].projectSlug
    const result = await resolveDepartment(params.department, projectPerms, supabase, 'update', projectSlug, ctx.workspaceId)
    if ('error' in result) {
      return mcpError(result.error)
    }

    // Extra check: if resolved via dept-specific perm, verify canCreate || canUpdate
    const destDeptPerm = projectPerms.find((p) => p.departmentId === result.departmentId)
    if (destDeptPerm && !(destDeptPerm.canCreate || destDeptPerm.canUpdate)) {
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

  // 6. Resolve assign_to if provided
  let assignedToKeyId: string | null | undefined = undefined
  if (params.assign_to !== undefined) {
    // Check that caller has can_assign permission
    const hasAssign = projectPerms.some((p) => p.canAssign)
    if (!hasAssign) {
      return mcpError(assignNotAllowedError(projectPerms[0].projectSlug))
    }

    if (params.assign_to === '') {
      // Unassign
      assignedToKeyId = null
    } else {
      const isAssigneeUuid = UUID_RE.test(params.assign_to)
      const { data: assignee } = await supabase
        .from('agent_keys')
        .select('id, is_active')
        .eq(isAssigneeUuid ? 'id' : 'name', params.assign_to)
        .eq('workspace_id', ctx.workspaceId)
        .abortSignal(AbortSignal.timeout(10_000))
        .maybeSingle()

      if (!assignee || !assignee.is_active) {
        return mcpError(invalidAssigneeError(params.assign_to))
      }

      // Verify assignee has permissions in this project
      const { count } = await supabase
        .from('agent_permissions')
        .select('id', { count: 'exact', head: true })
        .eq('agent_key_id', assignee.id)
        .eq('project_id', existingTask.project_id)
        .eq('workspace_id', ctx.workspaceId)
        .abortSignal(AbortSignal.timeout(10_000))

      if (!count || count === 0) {
        return mcpError(invalidAssigneeError(params.assign_to))
      }

      assignedToKeyId = assignee.id
    }
  }

  // 7. Build fields payload for the RPC (only provided fields)
  const fields: Record<string, unknown> = {}
  if (params.priority !== undefined) fields.priority = params.priority
  if (params.description !== undefined) fields.description = params.description.trim()
  if (params.notes !== undefined) fields.notes = params.notes
  if (params.due_date !== undefined) fields.due_date = params.due_date
  if (params.status !== undefined) fields.status = params.status
  if (newDepartmentId !== undefined) fields.department_id = newDepartmentId
  if (assignedToKeyId !== undefined) fields.assigned_to_agent_key_id = assignedToKeyId

  // 8. Atomic update via RPC (task + field-level event_log in one transaction)
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
      case 'invalid_assignee':
        return mcpError(invalidAssigneeError(params.assign_to ?? 'unknown'))
      case 'circular_delegation':
        return mcpError(circularDelegationError())
      case 'delegation_depth_exceeded':
        return mcpError(delegationDepthExceededError())
      default:
        return mcpError(internalError(rpcError.message))
    }
  }

  // 9. Return updated task
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
  }
}
