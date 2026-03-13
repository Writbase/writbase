import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { z } from 'zod'
import { handleInfo } from '../tools/info.ts'
import { handleGetTasks } from '../tools/get-tasks.ts'
import { handleAddTask } from '../tools/add-task.ts'
import { handleUpdateTask } from '../tools/update-task.ts'
import { handleManageAgentKeys } from '../tools/manage-agent-keys.ts'
import { handleManageAgentPermissions } from '../tools/manage-agent-permissions.ts'
import { handleGetProvenance } from '../tools/get-provenance.ts'
import { handleManageProjects } from '../tools/manage-projects.ts'
import { handleManageDepartments } from '../tools/manage-departments.ts'
import { handleSubscribe } from '../tools/subscribe.ts'
import { handleDiscoverAgents } from '../tools/discover-agents.ts'
import { handleGetTopTasks } from '../tools/get-top-tasks.ts'

/**
 * Build a per-request McpServer whose tool set is scoped to the
 * authenticated agent's role and permissions.
 */
export async function createMcpServerForAgent(
  ctx: AgentContext,
  supabase: SupabaseClient
): Promise<McpServer> {
  const server = new McpServer({ name: 'writbase', version: '1.0.0' })

  // ── Fetch app settings ──────────────────────────────────────────────
  const { data: settings } = await supabase
    .from('app_settings')
    .select('department_required')
    .eq('workspace_id', ctx.workspaceId)
    .single()
  const departmentRequired: boolean = settings?.department_required ?? false

  // ── Derive allowed projects & departments from permissions ──────────
  const activePerms = ctx.permissions.filter((p) => !p.isProjectArchived)
  const projectSlugs = [...new Set(activePerms.map((p) => p.projectSlug))].filter(Boolean)

  // Map project slug -> active department slugs
  const deptsByProject: Record<string, string[]> = {}
  for (const p of activePerms) {
    if (p.departmentSlug && !p.isDepartmentArchived) {
      const key = p.projectSlug
      if (!deptsByProject[key]) deptsByProject[key] = []
      if (!deptsByProject[key].includes(p.departmentSlug)) {
        deptsByProject[key].push(p.departmentSlug)
      }
    }
  }

  // Build dynamic description snippets
  const projectHint = projectSlugs.length > 0
    ? `Valid projects: ${projectSlugs.join(', ')}`
    : 'No projects assigned'
  const deptHint = Object.entries(deptsByProject)
    .map(([slug, depts]) => `Departments for ${slug}: ${depts.join(', ')}`)
    .join('; ')

  // Default project: stored default overrides computed (F5b → F5a fallback)
  const defaultProject = ctx.defaultProjectId
    ? projectSlugs.find(s => activePerms.find(p => p.projectSlug === s)?.projectId === ctx.defaultProjectId)
    : (projectSlugs.length === 1 ? projectSlugs[0] : undefined)

  // Default department: stored default overrides computed (F5b → F5a fallback)
  const defaultDept = ctx.defaultDepartmentId
    ? (() => {
        const dp = activePerms.find(p => p.departmentId === ctx.defaultDepartmentId && p.projectId === ctx.defaultProjectId && !p.isDepartmentArchived)
        return dp?.departmentSlug ?? undefined
      })()
    : (defaultProject && deptsByProject[defaultProject]?.length === 1
        ? deptsByProject[defaultProject][0] : undefined)

  // ── Helper: build project param as a Zod enum ──────────────────────
  const hasProjects = projectSlugs.length > 0
  const projectEnum = hasProjects
    ? z.enum(projectSlugs as [string, ...string[]])
    : z.never()

  // ── Helper: build optional department enum ─────────────────────────
  const allDepts = [...new Set(Object.values(deptsByProject).flat())]
  const deptEnum = allDepts.length > 0
    ? z.enum(allDepts as [string, ...string[]])
    : z.never()

  const noProjectsNote = !hasProjects
    ? ' NOTE: This agent has no permitted projects. Contact an admin to grant project access before using task tools.'
    : ''

  // ── WORKER TOOLS (available to all roles) ──────────────────────────

  // 1. info
  server.tool(
    'info',
    `Returns agent identity, role, permissions, and system info. ${projectHint}. ${deptHint}`,
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    () => handleInfo(ctx, supabase)
  )

  // 2. get_tasks
  server.tool(
    'get_tasks',
    `List tasks in a project.${noProjectsNote}`,
    {
      project: defaultProject
        ? projectEnum.default(defaultProject).describe('Project slug')
        : projectEnum.describe('Project slug'),
      department: defaultDept
        ? deptEnum.default(defaultDept).optional().describe('Filter by department slug')
        : deptEnum.optional().describe('Filter by department slug'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
      limit: z.number().max(50).optional().describe('Max results (default 20, max 50)'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
      updated_after: z.string().optional().describe('ISO 8601 timestamp to filter tasks updated after'),
      search: z.string().optional().describe('Full-text search query (supports AND/OR/NOT operators)'),
      assigned_to_me: z.boolean().optional().describe('Filter tasks assigned to this agent'),
      requested_by_me: z.boolean().optional().describe('Filter tasks this agent created for others'),
      include_archived: z.boolean().optional().describe('Include archived tasks (default false)'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    (params) => handleGetTasks(params, ctx, supabase)
  )

  // 3. add_task
  server.tool(
    'add_task',
    `Create a new task. ${departmentRequired ? 'Department is required.' : 'Department is optional.'}${noProjectsNote}`,
    {
      project: defaultProject
        ? projectEnum.default(defaultProject).describe('Project slug')
        : projectEnum.describe('Project slug'),
      department: departmentRequired
        ? (defaultDept ? deptEnum.default(defaultDept).describe('Department slug (required)') : deptEnum.describe('Department slug (required)'))
        : (defaultDept ? deptEnum.default(defaultDept).optional().describe('Department slug') : deptEnum.optional().describe('Department slug')),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
      description: z.string().min(3).describe('Task description (min 3 chars)'),
      notes: z.string().optional().describe('Additional notes'),
      due_date: z.string().optional().describe('Due date as ISO 8601 string'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed']).optional().describe('Initial status'),
      assign_to: z.string().optional().describe('Agent key ID or name to assign this task to (requires can_assign permission)'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    (params) => handleAddTask(params, ctx, supabase)
  )

  // 4. update_task
  server.tool(
    'update_task',
    `Update an existing task. Pass the version from get_tasks to detect conflicts.${noProjectsNote}`,
    {
      task_id: z.string().describe('Task UUID'),
      version: z.number().describe('Current version number (from get_tasks) for conflict detection'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('New priority'),
      description: z.string().min(3).optional().describe('New description'),
      notes: z.string().optional().describe('New notes'),
      department: deptEnum.optional().describe('New department slug'),
      due_date: z.string().optional().describe('New due date as ISO 8601'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed']).optional().describe('New status'),
      assign_to: z.string().optional().describe('Agent key ID or name to reassign to (empty string to unassign, requires can_assign permission)'),
      is_archived: z.boolean().optional().describe('Archive or unarchive this task (requires can_archive permission)'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    (params) => handleUpdateTask(params, ctx, supabase)
  )

  // 4b. get_top_tasks
  server.tool(
    'get_top_tasks',
    `Get top tasks by priority.${noProjectsNote}`,
    {
      project: defaultProject
        ? projectEnum.default(defaultProject).describe('Project slug')
        : projectEnum.describe('Project slug'),
      department: defaultDept
        ? deptEnum.default(defaultDept).optional().describe('Filter by department slug')
        : deptEnum.optional().describe('Filter by department slug'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed']).optional().describe('Filter by status'),
      limit: z.number().max(25).optional().describe('Max results (default 10, max 25)'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    (params) => handleGetTopTasks(params, ctx, supabase)
  )

  // ── MANAGER TOOLS (manager role only) ──────────────────────────────
  if (ctx.role === 'manager') {
    // 5. manage_agent_keys
    server.tool(
      'manage_agent_keys',
      'List, create, update, deactivate, or rotate agent keys. Manager only.',
      {
        action: z.enum(['list', 'create', 'update', 'deactivate', 'rotate']).describe('Action to perform'),
        key_id: z.string().optional().describe('Target agent key ID (required for update/deactivate/rotate)'),
        name: z.string().optional().describe('Agent key name (for create/update)'),
        role: z.enum(['worker', 'manager']).optional().describe('Agent role (for create/update)'),
        special_prompt: z.string().optional().describe('Special system prompt (for create/update)'),
        is_active: z.boolean().optional().describe('Active status (for update)'),
        default_project_id: z.string().optional().describe('Default project UUID (for create/update)'),
        default_department_id: z.string().optional().describe('Default department UUID (for create/update, requires default_project_id)'),
        limit: z.number().max(50).optional().describe('Max results for list action (default 20, max 50)'),
        cursor: z.string().optional().describe('Pagination cursor for list action'),
      },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      (params) => handleManageAgentKeys(params, ctx, supabase)
    )

    // 6. manage_agent_permissions
    server.tool(
      'manage_agent_permissions',
      'Grant, revoke, or list permissions for an agent key. Manager only.',
      {
        action: z.enum(['grant', 'revoke', 'list']).describe('Action to perform'),
        key_id: z.string().describe('Target agent key ID'),
        permissions: z.array(z.object({
          project_id: z.string().optional(),
          department_id: z.string().optional(),
          can_read: z.boolean().optional(),
          can_create: z.boolean().optional(),
          can_update: z.boolean().optional(),
          can_assign: z.boolean().optional(),
          can_comment: z.boolean().optional(),
          can_archive: z.boolean().optional(),
        })).optional().describe('Permissions to grant or revoke'),
      },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      (params) => handleManageAgentPermissions(params, ctx, supabase)
    )

    // 7. get_provenance
    server.tool(
      'get_provenance',
      'View event log / audit trail for a project.',
      {
        project: projectEnum.describe('Project slug'),
        target_type: z.enum(['task', 'agent_key', 'project', 'department']).optional().describe('Filter by target type'),
        event_category: z.enum(['task', 'admin', 'system']).optional().describe('Filter by event category'),
        limit: z.number().max(50).optional().describe('Max results (default 20, max 50)'),
        cursor: z.string().optional().describe('Pagination cursor'),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      (params) => handleGetProvenance(params, ctx, supabase)
    )

    // 8. manage_projects
    server.tool(
      'manage_projects',
      'Create, rename, or archive projects. Manager only.',
      {
        action: z.enum(['create', 'rename', 'archive']).describe('Action to perform'),
        project_id: z.string().optional().describe('Target project ID (for rename/archive)'),
        name: z.string().optional().describe('Project name (for create/rename)'),
      },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      (params) => handleManageProjects(params, ctx, supabase)
    )

    // 9. manage_departments
    server.tool(
      'manage_departments',
      'Create, rename, or archive departments. Manager only.',
      {
        action: z.enum(['create', 'rename', 'archive']).describe('Action to perform'),
        department_id: z.string().optional().describe('Target department ID (for rename/archive)'),
        name: z.string().optional().describe('Department name (for create/rename)'),
      },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      (params) => handleManageDepartments(params, ctx, supabase)
    )

    // 10. subscribe — register webhook for task notifications
    server.tool(
      'subscribe',
      'Register or manage webhook subscriptions for task event notifications.',
      {
        action: z.enum(['create', 'list', 'delete']).describe('Action to perform'),
        project: projectEnum.optional().describe('Project slug (required for create)'),
        url: z.string().optional().describe('Webhook HTTPS URL (required for create)'),
        event_types: z.array(z.string()).optional().describe('Event types to subscribe to (default: ["task.completed"])'),
        subscription_id: z.string().optional().describe('Subscription ID (required for delete)'),
      },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      (params) => handleSubscribe(params, ctx, supabase)
    )

    // 11. discover_agents — list agents with capabilities in a project
    server.tool(
      'discover_agents',
      'List agents and their capabilities in a project. Manager only.',
      {
        project: projectEnum.describe('Project slug'),
        skill: z.string().optional().describe('Filter by skill (e.g. "design", "coding")'),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      (params) => handleDiscoverAgents(params, ctx, supabase)
    )
  }

  return server
}
