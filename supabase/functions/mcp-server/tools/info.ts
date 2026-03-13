import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'

export async function handleInfo(ctx: AgentContext, supabase: SupabaseClient) {
  // Query app_settings for department_required
  const { data: settings } = await supabase
    .from('app_settings')
    .select('department_required')
    .eq('workspace_id', ctx.workspaceId)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()
  const departmentRequired: boolean = settings?.department_required ?? false

  // Build scopes from non-archived permissions
  const scopes = ctx.permissions
    .filter((p) => !p.isProjectArchived && !p.isDepartmentArchived)
    .map((p) => ({
      project: p.projectSlug,
      department: p.departmentSlug ?? null,
      can_read: p.canRead,
      can_create: p.canCreate,
      can_update: p.canUpdate,
      can_assign: p.canAssign,
      can_comment: p.canComment,
      can_archive: p.canArchive,
    }))

  // Resolve agent's home project/department slugs from permissions
  const agentProject = ctx.projectId
    ? ctx.permissions.find((p) => p.projectId === ctx.projectId)?.projectSlug ?? null
    : null
  const agentDepartment = ctx.departmentId
    ? ctx.permissions.find((p) => p.departmentId === ctx.departmentId)?.departmentSlug ?? null
    : null

  const result = {
    agent: {
      name: ctx.name,
      role: ctx.role,
      is_active: ctx.isActive,
      project: agentProject,
      department: agentDepartment,
    },
    permissions: {
      department_required: departmentRequired,
      scopes,
    },
    special_prompt: ctx.specialPrompt,
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}
