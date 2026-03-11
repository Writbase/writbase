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
import { logFieldChanges } from '../../_shared/event-log.ts'

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

const TRACKED_FIELDS = ['priority', 'description', 'notes', 'department_id', 'due_date', 'status']

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

  // 6. Build update payload with only provided fields
  const updatePayload: Record<string, unknown> = {
    updated_by_type: 'agent',
    updated_by_id: ctx.keyId,
    source: 'mcp',
  }

  if (params.priority !== undefined) updatePayload.priority = params.priority
  if (params.description !== undefined) updatePayload.description = params.description.trim()
  if (params.notes !== undefined) updatePayload.notes = params.notes
  if (params.due_date !== undefined) updatePayload.due_date = params.due_date
  if (params.status !== undefined) updatePayload.status = params.status
  if (newDepartmentId !== undefined) updatePayload.department_id = newDepartmentId

  // 7. Atomic optimistic concurrency update
  // Use RPC or raw SQL for version increment. Since supabase-js doesn't support
  // version = version + 1 natively, we use an RPC-like approach with .eq on version.
  // We'll do the update with version filter and then check if rows were affected.
  const { data: updated, error: updateError } = await supabase
    .from('tasks')
    .update({
      ...updatePayload,
      version: existingTask.version + 1,
    })
    .eq('id', params.task_id)
    .eq('version', params.version)
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle()

  if (updateError) {
    return mcpError({
      code: 'internal_error',
      message: updateError.message,
    })
  }

  // 8. If no rows returned → version conflict
  if (!updated) {
    // Re-query to get current version
    const { data: current } = await supabase
      .from('tasks')
      .select('version')
      .eq('id', params.task_id)
      .abortSignal(AbortSignal.timeout(10_000))
      .single()

    return mcpError(versionConflictError(current?.version ?? existingTask.version))
  }

  // 9. Field-level provenance: compare old task with new task
  await logFieldChanges(supabase, {
    eventCategory: 'task',
    targetType: 'task',
    targetId: params.task_id,
    eventType: 'task_updated',
    oldRecord: existingTask,
    newRecord: updated,
    trackedFields: TRACKED_FIELDS,
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  // 10. Return updated task
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(updated) }],
  }
}
