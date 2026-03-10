import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext, AgentPermission } from '../../_shared/types.ts'
import { selfModificationDeniedError, insufficientManagerScopeError, validationError } from '../../_shared/errors.ts'
import { logEvent } from '../../_shared/event-log.ts'

interface PermissionRow {
  project_id: string
  department_id?: string
  can_read?: boolean
  can_create?: boolean
  can_update?: boolean
}

interface ManageAgentPermissionsParams {
  action: string
  key_id: string
  permissions?: PermissionRow[]
}

function mcpError(error: { code: string; message: string; recovery?: string; fields?: Record<string, string>; [k: string]: unknown }) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(error) }],
    isError: true,
  }
}

/**
 * Check if a single manager permission row dominates a granted row.
 * Combining across rows is NOT allowed — one row must fully cover the grant.
 */
function checkDominance(managerPerms: AgentPermission[], grantedRow: PermissionRow): boolean {
  return managerPerms.some((mp) => {
    // Must be same project
    if (mp.projectId !== grantedRow.project_id) return false
    // Manager dept must be NULL (whole project) or same as granted dept
    if (mp.departmentId !== null && mp.departmentId !== (grantedRow.department_id ?? null)) return false
    // Manager actions must be superset
    if (grantedRow.can_read && !mp.canRead) return false
    if (grantedRow.can_create && !mp.canCreate) return false
    if (grantedRow.can_update && !mp.canUpdate) return false
    return true
  })
}

export async function handleManageAgentPermissions(
  params: ManageAgentPermissionsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
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

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  // deno-lint-ignore no-explicit-any
  const permissions = (data ?? []).map((row: any) => ({
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

  // Upsert permission rows
  const upsertRows = params.permissions.map((row) => ({
    agent_key_id: params.key_id,
    project_id: row.project_id,
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

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ granted: data }) }],
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

    const { data, error } = await query.select()

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
