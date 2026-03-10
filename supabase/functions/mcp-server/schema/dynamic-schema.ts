import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { handleInfo } from '../tools/info.ts'
import { handleGetTasks } from '../tools/get-tasks.ts'

/** Placeholder result returned by all tools until real implementations land. */
function notImplemented(toolName: string) {
  return {
    content: [{ type: 'text' as const, text: `Not implemented yet: ${toolName}` }],
  }
}

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

  // Default project if agent has exactly one
  const defaultProject = projectSlugs.length === 1 ? projectSlugs[0] : undefined

  // ── Helper: build project param as a Zod enum ──────────────────────
  const projectEnum = projectSlugs.length > 0
    ? z.enum(projectSlugs as [string, ...string[]])
    : z.string()

  // ── Helper: build optional department enum ─────────────────────────
  const allDepts = [...new Set(Object.values(deptsByProject).flat())]
  const deptEnum = allDepts.length > 0
    ? z.enum(allDepts as [string, ...string[]])
    : z.string()

  // ── WORKER TOOLS (available to all roles) ──────────────────────────

  // 1. info
  server.tool(
    'info',
    `Returns agent identity, role, permissions, and system info. ${projectHint}. ${deptHint}`,
    {},
    async () => handleInfo(ctx, supabase)
  )

  // 2. get_tasks
  server.tool(
    'get_tasks',
    `List tasks in a project. ${projectHint}. ${deptHint}`,
    {
      project: defaultProject
        ? projectEnum.default(defaultProject).describe('Project slug')
        : projectEnum.describe('Project slug'),
      department: deptEnum.optional().describe('Filter by department slug'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
      limit: z.number().max(50).optional().describe('Max results (default 20, max 50)'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
      updated_after: z.string().optional().describe('ISO 8601 timestamp to filter tasks updated after'),
    },
    async (params) => handleGetTasks(params, ctx, supabase)
  )

  // 3. add_task
  server.tool(
    'add_task',
    `Create a new task. ${projectHint}. ${deptHint}. ${departmentRequired ? 'Department is required.' : 'Department is optional.'}`,
    {
      project: defaultProject
        ? projectEnum.default(defaultProject).describe('Project slug')
        : projectEnum.describe('Project slug'),
      department: departmentRequired
        ? deptEnum.describe('Department slug (required)')
        : deptEnum.optional().describe('Department slug'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
      description: z.string().min(3).describe('Task description (min 3 chars)'),
      notes: z.string().optional().describe('Additional notes'),
      due_date: z.string().optional().describe('Due date as ISO 8601 string'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional().describe('Initial status'),
    },
    async () => notImplemented('add_task')
  )

  // 4. update_task
  server.tool(
    'update_task',
    `Update an existing task. Requires the current version for optimistic locking. ${projectHint}. ${deptHint}`,
    {
      task_id: z.string().describe('Task UUID'),
      version: z.number().describe('Current version number for optimistic locking'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('New priority'),
      description: z.string().min(3).optional().describe('New description'),
      notes: z.string().optional().describe('New notes'),
      department: deptEnum.optional().describe('New department slug'),
      due_date: z.string().optional().describe('New due date as ISO 8601'),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional().describe('New status'),
    },
    async () => notImplemented('update_task')
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
      },
      async () => notImplemented('manage_agent_keys')
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
        })).optional().describe('Permissions to grant or revoke'),
      },
      async () => notImplemented('manage_agent_permissions')
    )

    // 7. get_provenance
    server.tool(
      'get_provenance',
      `View event log / audit trail for a project. ${projectHint}`,
      {
        project: projectEnum.describe('Project slug'),
        target_type: z.enum(['task', 'agent_key', 'project', 'department']).optional().describe('Filter by target type'),
        event_category: z.enum(['task', 'admin', 'system']).optional().describe('Filter by event category'),
        limit: z.number().max(50).optional().describe('Max results (default 20, max 50)'),
        cursor: z.string().optional().describe('Pagination cursor'),
      },
      async () => notImplemented('get_provenance')
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
      async () => notImplemented('manage_projects')
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
      async () => notImplemented('manage_departments')
    )
  }

  return server
}
