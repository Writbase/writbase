import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { loadPermissions } from '../../_shared/auth.ts'
import { mcpError, selfModificationDeniedError, insufficientManagerScopeError, validationError, internalError } from '../../_shared/errors.ts'
import { logEvent } from '../../_shared/event-log.ts'
import { checkDominance, type PermissionGrant } from '../../_shared/permissions.ts'

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
      return await listPermissions(params, ctx, supabase)
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
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  try {
    const loaded = await loadPermissions(supabase, params.key_id, ctx.workspaceId)

    const permissions = loaded.map((p) => ({
      id: p.id,
      project_id: p.projectId,
      project_slug: p.projectSlug || null,
      project_name: p.projectName || null,
      department_id: p.departmentId,
      department_slug: p.departmentSlug,
      department_name: p.departmentName,
      can_read: p.canRead,
      can_create: p.canCreate,
      can_update: p.canUpdate,
      can_assign: p.canAssign,
      can_comment: p.canComment,
    }))

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ key_id: params.key_id, permissions }) }],
    }
  } catch (err) {
    return mcpError(internalError(err instanceof Error ? err.message : String(err)))
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

  // Block permission grants on inactive keys (pending approval or deactivated)
  const { data: targetKey, error: keyError } = await supabase
    .from('agent_keys')
    .select('is_active')
    .eq('id', params.key_id)
    .eq('workspace_id', ctx.workspaceId)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (keyError || !targetKey) {
    return mcpError(validationError({ key_id: 'Target agent key not found.' }))
  }

  if (!targetKey.is_active) {
    return mcpError({
      code: 'validation_error',
      message: 'Cannot grant permissions to an inactive key. The key must be activated first.',
      recovery: 'Ask an admin to activate the key via the dashboard, then retry.',
    })
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
    .eq('workspace_id', ctx.workspaceId)
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
      .eq('workspace_id', ctx.workspaceId)
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
    can_assign: row.can_assign ?? false,
    can_comment: row.can_comment ?? false,
    workspace_id: ctx.workspaceId,
  }))

  const { data, error } = await supabase
    .from('agent_permissions')
    .upsert(upsertRows, {
      onConflict: 'agent_key_id,project_id,department_id',
    })
    .select()
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError(internalError(error.message))
  }

  // Log events for each granted permission
  for (const row of data ?? []) {
    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'agent_key',
      targetId: params.key_id,
      eventType: 'permission_granted',
      newValue: { project_id: row.project_id, department_id: row.department_id, can_read: row.can_read, can_create: row.can_create, can_update: row.can_update, can_assign: row.can_assign, can_comment: row.can_comment },
      actorType: 'agent',
      actorId: ctx.keyId,
      actorLabel: ctx.name,
      source: 'mcp',
      workspaceId: ctx.workspaceId,
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

  // Validate all rows upfront
  for (const row of params.permissions) {
    if (!row.project_id) {
      return mcpError(validationError({ project_id: 'project_id is required in each permission row.' }))
    }
  }

  // Fetch all permissions for this key in one query
  const { data: existing, error: fetchError } = await supabase
    .from('agent_permissions')
    .select('id, project_id, department_id, can_read, can_create, can_update, can_assign, can_comment')
    .eq('agent_key_id', params.key_id)
    .eq('workspace_id', ctx.workspaceId)
    .abortSignal(AbortSignal.timeout(10_000))

  if (fetchError) {
    return mcpError(internalError(fetchError.message))
  }

  // Match requested revocations to existing permission IDs
  const toRevoke = (existing ?? []).filter((perm) =>
    params.permissions!.some((req) =>
      req.project_id === perm.project_id &&
      (req.department_id ?? null) === perm.department_id
    )
  )

  if (toRevoke.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ revoked: [] }) }],
    }
  }

  // Batch delete by IDs
  const ids = toRevoke.map((p) => p.id)
  const { error: deleteError } = await supabase
    .from('agent_permissions')
    .delete()
    .in('id', ids)
    .abortSignal(AbortSignal.timeout(10_000))

  if (deleteError) {
    return mcpError(internalError(deleteError.message))
  }

  // Log events for each revoked permission
  for (const deleted of toRevoke) {
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
      workspaceId: ctx.workspaceId,
    })
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ revoked: toRevoke }) }],
  }
}
