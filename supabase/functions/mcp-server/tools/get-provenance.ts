import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { mcpError, insufficientManagerScopeError, invalidProjectError, scopeNotAllowedError, validationError } from '../../_shared/errors.ts'
import { encodeCursor, decodeCursor } from '../../_shared/pagination.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GetProvenanceParams {
  project: string
  target_type?: string
  event_category?: string
  limit?: number
  cursor?: string
}

export async function handleGetProvenance(
  params: GetProvenanceParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') return mcpError(insufficientManagerScopeError())

  // 1. Resolve project
  const isUuid = UUID_RE.test(params.project)
  const projectPerms = ctx.permissions.filter((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (projectPerms.length === 0) {
    return mcpError(invalidProjectError(params.project))
  }

  const projectId = projectPerms[0].projectId

  // 2. Check can_read
  const hasRead = projectPerms.some((p) => p.canRead)
  if (!hasRead) {
    return mcpError(scopeNotAllowedError(params.project, 'read'))
  }

  // 3. Parse limit
  const limit = Math.min(params.limit ?? 20, 50)

  // 4. Build query
  let query = supabase
    .from('event_log')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1) // fetch one extra for next_cursor

  // Filter by target_type
  if (params.target_type) {
    query = query.eq('target_type', params.target_type)
  }

  // Filter by event_category
  if (params.event_category) {
    query = query.eq('event_category', params.event_category)
  }

  // For task events, we need to filter to tasks within the project.
  // For non-task target types (project, department, agent_key), filter by target_id = projectId
  // For task targets, we need a different approach: get task IDs in the project first.
  if (params.target_type === 'task' || !params.target_type) {
    // We need to scope to this project. For task events, the target_id is the task UUID.
    // Get task IDs belonging to this project.
    const { data: projectTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)

    const taskIds = (projectTasks ?? []).map((t: { id: string }) => t.id)

    if (params.target_type === 'task') {
      if (taskIds.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ events: [], next_cursor: null }) }],
        }
      }
      query = query.in('target_id', taskIds)
    } else if (!params.target_type) {
      // No target_type filter: include task events for this project + project/dept/key events where target_id = projectId
      // This is complex with OR filters; use a simpler approach: get events for task IDs + project ID
      const allTargetIds = [...taskIds, projectId]
      if (allTargetIds.length > 0) {
        query = query.in('target_id', allTargetIds)
      }
    }
  } else if (params.target_type === 'project') {
    query = query.eq('target_id', projectId)
  }
  // For department and agent_key target types, we return all matching events
  // (these are admin-scoped and the manager has access)

  // 5. Apply cursor
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor)
    if (!decoded) {
      return mcpError(validationError({ cursor: 'Invalid cursor.' }))
    }
    // Keyset pagination: rows older than cursor
    query = query.or(`created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`)
  }

  const { data, error } = await query

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  const events = data ?? []
  let nextCursor: string | null = null

  if (events.length > limit) {
    const lastEvent = events[limit - 1]
    nextCursor = encodeCursor(lastEvent.created_at, lastEvent.id)
    events.length = limit // trim the extra
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ events, next_cursor: nextCursor }),
    }],
  }
}
