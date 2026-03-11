import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  invalidDepartmentError,
  scopeNotAllowedError,
  validationError,
  internalError,
} from '../../_shared/errors.ts'
import { validateTaskInput } from '../../_shared/validation.ts'
import { parseRpcErrorCode } from '../../_shared/rpc-errors.ts'
import { resolveDepartment } from '../../_shared/department-resolver.ts'

interface AddTaskParams {
  project: string
  department?: string
  priority?: string
  description: string
  notes?: string
  due_date?: string
  status?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleAddTask(
  params: AddTaskParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  // 1. Resolve project (slug or UUID) from ctx.permissions
  const isUuid = UUID_RE.test(params.project)

  const projectPerms = ctx.permissions.filter((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (projectPerms.length === 0) {
    return mcpError(invalidProjectError(params.project))
  }

  const projectId = projectPerms[0].projectId

  // 2. Reject if project is archived
  if (projectPerms[0].isProjectArchived) {
    return mcpError({
      code: 'invalid_project',
      message: `Project "${params.project}" is archived.`,
      recovery: 'This project is archived. No new tasks can be created.',
    })
  }

  // 3. Check agent has can_create for this project scope
  const hasCreate = projectPerms.some((p) => p.canCreate)
  if (!hasCreate) {
    return mcpError(scopeNotAllowedError(params.project, 'create'))
  }

  // 4. Resolve department if provided
  let departmentId: string | null = null
  if (params.department) {
    const result = await resolveDepartment(params.department, projectPerms, supabase, 'create', params.project)
    if ('error' in result) {
      return mcpError(result.error)
    }
    departmentId = result.departmentId
  } else {
    // 5. If department not provided, check if department_required
    const { data: settings } = await supabase
      .from('app_settings')
      .select('department_required')
      .abortSignal(AbortSignal.timeout(10_000))
      .single()

    if (settings?.department_required) {
      return mcpError(validationError({ department: 'Department is required by system settings.' }))
    }
  }

  // 6. Validate task fields
  const fieldsToValidate: Record<string, unknown> = { description: params.description }
  if (params.priority !== undefined) fieldsToValidate.priority = params.priority
  if (params.status !== undefined) fieldsToValidate.status = params.status
  if (params.due_date !== undefined) fieldsToValidate.due_date = params.due_date

  const fieldErrors = validateTaskInput(fieldsToValidate)
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // 7. Create task atomically via RPC (task + event_log in one transaction)
  const { data: task, error: rpcError } = await supabase
    .rpc('create_task_with_event', {
      p_payload: {
        project_id: projectId,
        department_id: departmentId,
        priority: params.priority ?? 'medium',
        description: params.description.trim(),
        notes: params.notes ?? null,
        due_date: params.due_date ?? null,
        status: params.status ?? 'todo',
        created_by_type: 'agent',
        created_by_id: ctx.keyId,
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
      case 'project_not_found':
        return mcpError(invalidProjectError(params.project))
      case 'project_archived':
        return mcpError({
          code: 'invalid_project',
          message: `Project "${params.project}" is archived.`,
          recovery: 'This project is archived. No new tasks can be created.',
        })
      case 'department_not_found':
      case 'department_archived':
        return mcpError(invalidDepartmentError(params.department ?? 'unknown'))
      default:
        return mcpError(internalError(rpcError.message))
    }
  }

  // 8. Return created task
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(task) }],
  }
}
