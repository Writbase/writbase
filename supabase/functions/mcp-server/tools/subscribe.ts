import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  insufficientManagerScopeError,
  validationError,
  internalError,
} from '../../_shared/errors.ts'

interface SubscribeParams {
  action: 'create' | 'list' | 'delete'
  project?: string
  url?: string
  event_types?: string[]
  subscription_id?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_EVENT_TYPES = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.failed',
  'task.assigned',
  'task.reassigned',
]

export function handleSubscribe(
  params: SubscribeParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') {
    return mcpError(insufficientManagerScopeError())
  }

  switch (params.action) {
    case 'create':
      return handleCreate(params, ctx, supabase)
    case 'list':
      return handleList(ctx, supabase)
    case 'delete':
      return handleDelete(params, ctx, supabase)
  }
}

async function handleCreate(
  params: SubscribeParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.project) {
    return mcpError(validationError({ project: 'Project is required for creating a subscription.' }))
  }
  if (!params.url) {
    return mcpError(validationError({ url: 'Webhook URL is required.' }))
  }

  // Validate URL is HTTPS
  try {
    const parsed = new URL(params.url)
    if (parsed.protocol !== 'https:') {
      return mcpError(validationError({ url: 'Webhook URL must use HTTPS.' }))
    }
  } catch {
    return mcpError(validationError({ url: 'Invalid URL format.' }))
  }

  // Validate event types
  const eventTypes = params.event_types ?? ['task.completed']
  for (const et of eventTypes) {
    if (!VALID_EVENT_TYPES.includes(et)) {
      return mcpError(validationError({
        event_types: `Invalid event type "${et}". Valid types: ${VALID_EVENT_TYPES.join(', ')}`,
      }))
    }
  }

  // Resolve project
  const isUuid = UUID_RE.test(params.project)
  const projectPerm = ctx.permissions.find((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (!projectPerm) {
    return mcpError(invalidProjectError(params.project))
  }

  // Generate webhook secret for HMAC verification
  const secretBytes = new Uint8Array(32)
  crypto.getRandomValues(secretBytes)
  const secret = Array.from(secretBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .insert({
      agent_key_id: ctx.keyId,
      project_id: projectPerm.projectId,
      event_types: eventTypes,
      url: params.url,
      secret,
      is_active: true,
      workspace_id: ctx.workspaceId,
    })
    .select('id, project_id, event_types, url, is_active, created_at')
    .single()

  if (error) {
    return mcpError(internalError(error.message))
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ...data,
        secret,
        _note: 'Store this secret securely — it is used to verify webhook HMAC-SHA256 signatures and will not be shown again.',
      }),
    }],
  }
}

async function handleList(ctx: AgentContext, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, project_id, event_types, url, is_active, created_at, updated_at')
    .eq('agent_key_id', ctx.keyId)
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    return mcpError(internalError(error.message))
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ subscriptions: data ?? [] }) }],
  }
}

async function handleDelete(
  params: SubscribeParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.subscription_id) {
    return mcpError(validationError({ subscription_id: 'Subscription ID is required for delete.' }))
  }

  const { error } = await supabase
    .from('webhook_subscriptions')
    .delete()
    .eq('id', params.subscription_id)
    .eq('agent_key_id', ctx.keyId)
    .eq('workspace_id', ctx.workspaceId)

  if (error) {
    return mcpError(internalError(error.message))
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ deleted: params.subscription_id }) }],
  }
}
