import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  scopeNotAllowedError,
  internalError,
} from '../../_shared/errors.ts'
import { resolveDepartment } from '../../_shared/department-resolver.ts'
import { compactTasks } from '../../_shared/task-shape.ts'

interface GetTopTasksParams {
  project: string
  department?: string
  status?: string
  limit?: number
  verbose?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleGetTopTasks(
  params: GetTopTasksParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  const activePerms = ctx.permissions.filter((p) => !p.isProjectArchived)

  // 1. Resolve project
  const isUuid = UUID_RE.test(params.project)
  const projectPerm = activePerms.find((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (!projectPerm) {
    return mcpError(invalidProjectError(params.project))
  }

  const projectId = projectPerm.projectId
  const projectPerms = activePerms.filter((p) => p.projectId === projectId)
  const hasRead = projectPerms.some((p) => p.canRead)
  if (!hasRead) {
    return mcpError(scopeNotAllowedError(params.project, 'read'))
  }

  // 2. Resolve department: explicit param → agent default → null (all)
  const effectiveDept = params.department
    ?? (ctx.defaultDepartmentId && projectPerms.some((p) => p.departmentId === ctx.defaultDepartmentId)
      ? ctx.defaultDepartmentId
      : undefined)
  let departmentId: string | null = null
  if (effectiveDept) {
    const result = await resolveDepartment(effectiveDept, projectPerms, supabase, 'read', params.project, ctx.workspaceId)
    if ('error' in result) {
      return mcpError(result.error)
    }
    departmentId = result.departmentId
  }

  // 3. Call RPC
  const limit = Math.min(params.limit || 10, 25)
  const { data: tasks, error } = await supabase.rpc('get_top_tasks', {
    p_workspace_id: ctx.workspaceId,
    p_project_id: projectId,
    p_department_id: departmentId,
    p_status: params.status || null,
    p_limit: limit,
  }).abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError(internalError(error.message))
  }

  const taskList = tasks || []
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ tasks: params.verbose ? taskList : compactTasks(taskList) }) }],
  }
}
