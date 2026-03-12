import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { generateAgentKey } from '../../_shared/auth.ts'
import { mcpError, insufficientManagerScopeError, selfModificationDeniedError, validationError } from '../../_shared/errors.ts'
import { logEvent } from '../../_shared/event-log.ts'

interface ManageAgentKeysParams {
  action: string
  key_id?: string
  name?: string
  role?: string
  special_prompt?: string
  is_active?: boolean
}

export async function handleManageAgentKeys(
  params: ManageAgentKeysParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') return mcpError(insufficientManagerScopeError())

  switch (params.action) {
    case 'list':
      return await listKeys(ctx, supabase)
    case 'create':
      return await createKey(params, ctx, supabase)
    case 'update':
      return await updateKey(params, ctx, supabase)
    case 'deactivate':
      return await deactivateKey(params, ctx, supabase)
    case 'rotate':
      return await rotateKey(params, ctx, supabase)
    default:
      return mcpError(validationError({ action: `Invalid action: ${params.action}` }))
  }
}

async function listKeys(ctx: AgentContext, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('agent_keys')
    .select('id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ keys: data }) }],
  }
}

async function createKey(
  params: ManageAgentKeysParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.name) {
    return mcpError(validationError({ name: 'Name is required when creating a key.' }))
  }

  const role = params.role ?? 'worker'

  if (role === 'manager') {
    return mcpError({
      code: 'validation_error',
      message: 'Managers can only create worker keys.',
      recovery: 'Set role to "worker" or omit it.',
    })
  }

  // Check settings: approval requirement and max keys limit
  const { data: settings } = await supabase
    .from('app_settings')
    .select('require_human_approval_for_agent_keys, max_agent_keys_per_manager')
    .eq('workspace_id', ctx.workspaceId)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()
  const requireApproval: boolean = settings?.require_human_approval_for_agent_keys ?? false
  const maxKeys: number | null = settings?.max_agent_keys_per_manager ?? 20

  // Enforce max agent keys per manager
  if (maxKeys !== null) {
    const { count, error: countError } = await supabase
      .from('agent_keys')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', ctx.keyId)
      .eq('workspace_id', ctx.workspaceId)
      .abortSignal(AbortSignal.timeout(10_000))

    if (countError) {
      return mcpError({ code: 'internal_error', message: countError.message })
    }

    if ((count ?? 0) >= maxKeys) {
      return mcpError({
        code: 'validation_error',
        message: `Maximum of ${maxKeys} agent keys per manager reached.`,
        recovery: 'Deactivate or remove unused keys before creating new ones.',
      })
    }
  }

  const keyData = await generateAgentKey()

  const isActive = requireApproval ? false : true

  const { error: insertError } = await supabase
    .from('agent_keys')
    .insert({
      id: keyData.keyId,
      name: params.name.trim(),
      role,
      key_hash: keyData.keyHash,
      key_prefix: keyData.keyPrefix,
      is_active: isActive,
      special_prompt: params.special_prompt ?? null,
      created_by: ctx.keyId,
      workspace_id: ctx.workspaceId,
    })
    .abortSignal(AbortSignal.timeout(10_000))

  if (insertError) {
    return mcpError({ code: 'internal_error', message: insertError.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: keyData.keyId,
    eventType: requireApproval ? 'agent_key.pending_approval' : 'agent_key_created',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
    workspaceId: ctx.workspaceId,
  })

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        key_id: keyData.keyId,
        full_key: keyData.fullKey,
        name: params.name.trim(),
        role,
        is_active: isActive,
        pending_approval: requireApproval,
        warning: 'Store this key securely. It will NOT be shown again.',
        ...(requireApproval && {
          guidance: 'This key requires human approval before it can be used. An admin must activate it via the dashboard.',
        }),
      }),
    }],
  }
}

async function updateKey(
  params: ManageAgentKeysParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.key_id) {
    return mcpError(validationError({ key_id: 'key_id is required for update.' }))
  }

  if (params.key_id === ctx.keyId) {
    return mcpError(selfModificationDeniedError())
  }

  const updates: Record<string, unknown> = {}
  if (params.name !== undefined) updates.name = params.name.trim()
  if (params.special_prompt !== undefined) updates.special_prompt = params.special_prompt
  if (params.is_active !== undefined) updates.is_active = params.is_active

  if (Object.keys(updates).length === 0) {
    return mcpError(validationError({ _: 'No fields to update. Provide name, special_prompt, or is_active.' }))
  }

  const { data, error } = await supabase
    .from('agent_keys')
    .update(updates)
    .eq('id', params.key_id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at')
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.key_id,
    eventType: 'agent_key_updated',
    newValue: updates,
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
    workspaceId: ctx.workspaceId,
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

async function deactivateKey(
  params: ManageAgentKeysParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.key_id) {
    return mcpError(validationError({ key_id: 'key_id is required for deactivate.' }))
  }

  if (params.key_id === ctx.keyId) {
    return mcpError(selfModificationDeniedError())
  }

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ is_active: false })
    .eq('id', params.key_id)
    .eq('workspace_id', ctx.workspaceId)
    .select('id, name, role, is_active')
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.key_id,
    eventType: 'agent_key_deactivated',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
    workspaceId: ctx.workspaceId,
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

async function rotateKey(
  params: ManageAgentKeysParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.key_id) {
    return mcpError(validationError({ key_id: 'key_id is required for rotate.' }))
  }

  if (params.key_id === ctx.keyId) {
    return mcpError(selfModificationDeniedError())
  }

  const keyData = await generateAgentKey()

  // Update the existing key record with the new hash and prefix, keep the same id
  const { error } = await supabase
    .from('agent_keys')
    .update({
      key_hash: keyData.keyHash,
      key_prefix: keyData.keyPrefix,
    })
    .eq('id', params.key_id)
    .eq('workspace_id', ctx.workspaceId)
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.key_id,
    eventType: 'agent_key_rotated',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
    workspaceId: ctx.workspaceId,
  })

  // Build the full key using the existing key_id but the new secret
  const fullKey = `wb_${params.key_id}_${keyData.secret}`

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        key_id: params.key_id,
        full_key: fullKey,
        warning: 'Store this key securely. It will NOT be shown again.',
      }),
    }],
  }
}
