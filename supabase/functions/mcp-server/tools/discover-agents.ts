import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  mcpError,
  invalidProjectError,
  insufficientManagerScopeError,
  internalError,
} from '../../_shared/errors.ts'

interface DiscoverAgentsParams {
  project: string
  skill?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleDiscoverAgents(
  params: DiscoverAgentsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') {
    return mcpError(insufficientManagerScopeError())
  }

  // Resolve project
  const isUuid = UUID_RE.test(params.project)
  const projectPerm = ctx.permissions.find((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (!projectPerm) {
    return mcpError(invalidProjectError(params.project))
  }

  // Find all agent keys with permissions in this project
  const { data: permRows, error: permError } = await supabase
    .from('agent_permissions')
    .select('agent_key_id')
    .eq('project_id', projectPerm.projectId)
    .abortSignal(AbortSignal.timeout(10_000))

  if (permError) {
    return mcpError(internalError(permError.message))
  }

  const agentKeyIds = [...new Set((permRows ?? []).map((r) => r.agent_key_id))]
  if (agentKeyIds.length === 0) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ agents: [] }) }],
    }
  }

  // Load agent keys
  const { data: agents, error: agentsError } = await supabase
    .from('agent_keys')
    .select('id, name, role, is_active, last_used_at')
    .in('id', agentKeyIds)
    .eq('is_active', true)
    .abortSignal(AbortSignal.timeout(10_000))

  if (agentsError) {
    return mcpError(internalError(agentsError.message))
  }

  // Load capabilities for these agents
  const { data: capabilities } = await supabase
    .from('agent_capabilities')
    .select('agent_key_id, skills, description, accepts_tasks')
    .in('agent_key_id', agentKeyIds)
    .abortSignal(AbortSignal.timeout(10_000))

  const capMap = new Map(
    (capabilities ?? []).map((c) => [c.agent_key_id, c])
  )

  // Build Agent Card-shaped response
  const result = (agents ?? []).map((agent) => {
    const cap = capMap.get(agent.id)
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      last_used_at: agent.last_used_at,
      capabilities: cap
        ? {
            skills: cap.skills,
            description: cap.description,
            accepts_tasks: cap.accepts_tasks,
          }
        : null,
    }
  })

  // Filter by skill if requested
  const filtered = params.skill
    ? result.filter((a) => a.capabilities?.skills.includes(params.skill!))
    : result

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ agents: filtered }) }],
  }
}
