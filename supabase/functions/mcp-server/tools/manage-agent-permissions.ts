import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { mcpError, selfModificationDeniedError, insufficientManagerScopeError, validationError } from '../../_shared/errors.ts'
import { logEvent } from '../../_shared/event-log.ts'
import { checkDominance, type PermissionGrant } from '../../_shared/permissions.ts'

/** Shape of a row returned by the permissions list query with joined projects/departments. */
interface PermissionListRow {
  id: string
  project_id: string
  department_id: string | null
  can_read: boolean
  can_create: boolean
  can_update: boolean
  projects: { slug: string; name: string } | null
  departments: { slug: string; name: string } | null
}

interface ManageAgentPermissionsParams {
  action: string
  key_id: string
  permissions?: PermissionGrant[]
}

export async function handleManageAgentPermissions(
  params: ManageAgentPermissionsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') return mcpError(insufficientManagerScopeError())

  switch (params.action) {
    case 'list':
      return await listPermissions(params, supabase)
    case 'grant':
      return await grantPermissions(params, ctx, supabase)
    case 'revoke':
      return await revokePermissions(params, ctx, supabase)
    default:
      return mcpError(validationError({ action: `Invalid action: ${params.action}` }))
  }
}

async function listPermissions(
  params: ManageAgentPermissionsParams,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('agent_permissions')
    .select(`
      id,
      project_id,
      department_id,
      can_read,
      can_create,
      can_update,
      projects:project_id ( slug, name ),
      departments:department_id ( slug, name )
    `)
    .eq('agent_key_id', params.key_id)
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  const permissions = ((data ?? []) as unknown as PermissionListRow[]).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_slug: row.projects?.slug ?? null,
    project_name: row.projects?.name ?? null,
    department_id: row.department_id,
    department_slug: row.departments?.slug ?? null,
    department_name: row.departments?.name ?? null,
    can_read: row.can_read,
    can_create: row.can_create,
    can_update: row.can_update,
  }))

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ key_id: params.key_id, permissions }) }],
  }
}

async function grantPermissions(
  params: ManageAgentPermissionsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (params.key_id === ctx.keyId) {
    return mcpError(selfModificationDeniedError())
  }

  if (!params.permissions || params.permissions.length === 0) {
    return mcpError(validationError({ permissions: 'At least one permission row is required for grant.' }))
  }

  // Validate each granted row against the per-row subset constraint
  for (const row of params.permissions) {
    if (!row.project_id) {
      return mcpError(validationError({ project_id: 'project_id is required in each permission row.' }))
    }

    if (!checkDominance(ctx.permissions, row)) {
      return mcpError(insufficientManagerScopeError())
    }
  }

  // Check for archived projects (warning, not blocking)
  const projectIds = [...new Set(params.permissions.map(r => r.project_id!))]
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_archived')
    .in('id', projectIds)
    .abortSignal(AbortSignal.timeout(10_000))

  const archivedWarnings: string[] = []
  for (const proj of projects ?? []) {
    if (proj.is_archived) {
      archivedWarnings.push(`Project "${proj.name}" is archived. Granted permissions will be inert until the project is unarchived.`)
    }
  }

  // Check for archived departments (warning, not blocking)
  const deptIds = params.permissions
    .map(r => r.department_id)
    .filter((id): id is string => id != null)

  if (deptIds.length > 0) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, is_archived')
      .in('id', [...new Set(deptIds)])
      .abortSignal(AbortSignal.timeout(10_000))

    for (const dept of depts ?? []) {
      if (dept.is_archived) {
        archivedWarnings.push(`Department "${dept.name}" is archived. Tasks cannot be created in this department until it is unarchived.`)
      }
    }
  }

  // Upsert permission rows (project_id validated above)
  const upsertRows = params.permissions.map((row) => ({
    agent_key_id: params.key_id,
    project_id: row.project_id!,
    department_id: row.department_id ?? null,
    can_read: row.can_read ?? false,
    can_create: row.can_create ?? false,
    can_update: row.can_update ?? false,
  }))

  const { data, error } = await supabase
    .from('agent_permissions')
    .upsert(upsertRows, {
      onConflict: 'agent_key_id,project_id,department_id',
    })
    .select()
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  // Log events for each granted permission
  for (const row of data ?? []) {
    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'agent_key',
      targetId: params.key_id,
      eventType: 'permission_granted',
      newValue: { project_id: row.project_id, department_id: row.department_id, can_read: row.can_read, can_create: row.can_create, can_update: row.can_update },
      actorType: 'agent',
      actorId: ctx.keyId,
      actorLabel: ctx.name,
      source: 'mcp',
    })
  }

  const result: Record<string, unknown> = { granted: data }
  if (archivedWarnings.length > 0) {
    result.warnings = archivedWarnings
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  }
}

async function revokePermissions(
  params: ManageAgentPermissionsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (params.key_id === ctx.keyId) {
    return mcpError(selfModificationDeniedError())
  }

  if (!params.permissions || params.permissions.length === 0) {
    return mcpError(validationError({ permissions: 'At least one permission row is required for revoke.' }))
  }

  const revoked = []

  for (const row of params.permissions) {
    if (!row.project_id) {
      return mcpError(validationError({ project_id: 'project_id is required in each permission row.' }))
    }

    let query = supabase
      .from('agent_permissions')
      .delete()
      .eq('agent_key_id', params.key_id)
      .eq('project_id', row.project_id)

    if (row.department_id) {
      query = query.eq('department_id', row.department_id)
    } else {
      query = query.is('department_id', null)
    }

    const { data, error } = await query.select().abortSignal(AbortSignal.timeout(10_000))

    if (error) {
      return mcpError({ code: 'internal_error', message: error.message })
    }

    for (const deleted of data ?? []) {
      revoked.push(deleted)
      await logEvent(supabase, {
        eventCategory: 'admin',
        targetType: 'agent_key',
        targetId: params.key_id,
        eventType: 'permission_revoked',
        oldValue: { project_id: deleted.project_id, department_id: deleted.department_id },
        actorType: 'agent',
        actorId: ctx.keyId,
        actorLabel: ctx.name,
        source: 'mcp',
      })
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ revoked }) }],
  }
}
