import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  invalidDepartmentError,
  validationError,
  assignNotAllowedError,
  internalError,
} from '../../_shared/errors.ts'
import { validateTaskInput } from '../../_shared/validation.ts'
import { parseRpcErrorCode } from '../../_shared/rpc-errors.ts'
import { resolveDepartment } from '../../_shared/department-resolver.ts'

interface AssignTaskParams {
  project: string
  department: string
  priority?: string
  description: string
  notes?: string
  due_date?: string
  status?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleAssignTask(
  params: AssignTaskParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  // 1. Resolve project
  const isUuid = UUID_RE.test(params.project)
  const projectPerms = ctx.permissions.filter((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )
  if (projectPerms.length === 0) {
    return mcpError(invalidProjectError(params.project))
  }
  const projectId = projectPerms[0].projectId

  // 2. Reject archived project
  if (projectPerms[0].isProjectArchived) {
    return mcpError({
      code: 'invalid_project',
      message: `Project "${params.project}" is archived.`,
      recovery: 'This project is archived. No new tasks can be assigned.',
    })
  }

  // 3. Check can_assign (not can_create) for the department scope
  const hasAssign = projectPerms.some((p) => p.canAssign)
  if (!hasAssign) {
    return mcpError(assignNotAllowedError(params.project))
  }

  // 4. Resolve department (required for assign_task)
  const result = await resolveDepartment(params.department, projectPerms, supabase, 'assign', params.project, ctx.workspaceId)
  if ('error' in result) {
    return mcpError(result.error)
  }
  const departmentId = result.departmentId

  // 5. Validate task fields
  const fieldsToValidate: Record<string, unknown> = { description: params.description }
  if (params.priority !== undefined) fieldsToValidate.priority = params.priority
  if (params.status !== undefined) fieldsToValidate.status = params.status
  if (params.due_date !== undefined) fieldsToValidate.due_date = params.due_date

  const fieldErrors = validateTaskInput(fieldsToValidate)
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // 6. Create task via RPC
  const { data: task, error: rpcError } = await supabase
    .rpc('create_task_with_event', {
      p_payload: {
        workspace_id: ctx.workspaceId,
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
          recovery: 'This project is archived. No new tasks can be assigned.',
        })
      case 'department_not_found':
      case 'department_archived':
        return mcpError(invalidDepartmentError(params.department))
      default:
        return mcpError(internalError(rpcError.message))
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(task) }],
  }
}
