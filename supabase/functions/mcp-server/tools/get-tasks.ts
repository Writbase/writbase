import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  invalidDepartmentError,
  scopeNotAllowedError,
} from '../../_shared/errors.ts'
import { encodeCursor, decodeCursor } from '../../_shared/pagination.ts'

interface GetTasksParams {
  project: string
  department?: string
  status?: string
  priority?: string
  limit?: number
  cursor?: string
  updated_after?: string
}

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleGetTasks(
  params: GetTasksParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  const activePerms = ctx.permissions.filter((p) => !p.isProjectArchived)

  // 1. Resolve project: accept slug OR UUID
  const isUuid = UUID_RE.test(params.project)
  const projectPerm = activePerms.find((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (!projectPerm) {
    return mcpError(invalidProjectError(params.project))
  }

  const projectId = projectPerm.projectId

  // 2. Check scope: agent must have can_read for this project
  // Collect all permissions for this project (there may be multiple rows for different departments)
  const projectPerms = activePerms.filter((p) => p.projectId === projectId)
  const hasRead = projectPerms.some((p) => p.canRead)
  if (!hasRead) {
    return mcpError(scopeNotAllowedError(params.project, 'read'))
  }

  // 3. Resolve department if provided
  let departmentId: string | null = null
  if (params.department) {
    const isDeptUuid = UUID_RE.test(params.department)

    // Check if agent has permission for this department
    // Agent is allowed if they have a project-wide permission (departmentId IS NULL) or a matching department permission
    const hasProjectWide = projectPerms.some((p) => p.departmentId === null && p.canRead)
    const deptPerm = projectPerms.find((p) =>
      isDeptUuid
        ? p.departmentId === params.department
        : p.departmentSlug === params.department
    )

    if (!hasProjectWide && !deptPerm) {
      return mcpError(scopeNotAllowedError(params.project, 'read'))
    }

    if (deptPerm) {
      // Check if department is archived
      if (deptPerm.isDepartmentArchived) {
        return mcpError(invalidDepartmentError(params.department))
      }
      departmentId = deptPerm.departmentId
    } else {
      // Agent has project-wide access; resolve the department slug/UUID to an ID
      if (isDeptUuid) {
        departmentId = params.department
      } else {
        // Look up the department by slug
        const { data: dept } = await supabase
          .from('departments')
          .select('id, is_archived')
          .eq('slug', params.department)
          .single()

        if (!dept || dept.is_archived) {
          return mcpError(invalidDepartmentError(params.department))
        }
        departmentId = dept.id
      }
    }
  }

  // 4. Decode cursor if provided
  let cursorCreatedAt: string | null = null
  let cursorId: string | null = null
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor)
    if (decoded) {
      cursorCreatedAt = decoded.createdAt
      cursorId = decoded.id
    }
  }

  // 5. Call the get_tasks_page RPC function
  const limit = Math.min(params.limit || 20, 50)

  const { data: tasks, error } = await supabase.rpc('get_tasks_page', {
    p_project_id: projectId,
    p_department_id: departmentId,
    p_status: params.status || null,
    p_priority: params.priority || null,
    p_updated_after: params.updated_after || null,
    p_cursor_created_at: cursorCreatedAt,
    p_cursor_id: cursorId,
    p_limit: limit,
  })

  if (error) {
    return mcpError({
      code: 'internal_error',
      message: error.message,
    })
  }

  // 6. Build next_cursor if results.length == limit
  let nextCursor: string | undefined
  if (tasks && tasks.length === limit) {
    const lastRow = tasks[tasks.length - 1]
    nextCursor = encodeCursor(lastRow.created_at, lastRow.id)
  }

  // 7. Return result
  const result: { tasks: unknown[]; next_cursor?: string } = {
    tasks: tasks || [],
  }
  if (nextCursor) {
    result.next_cursor = nextCursor
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}
