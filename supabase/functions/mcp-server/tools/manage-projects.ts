import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { mcpError, insufficientManagerScopeError, validationError } from '../../_shared/errors.ts'
import { validateProjectInput } from '../../_shared/validation.ts'
import { logEvent } from '../../_shared/event-log.ts'
import { generateSlug, ensureUniqueSlug } from '../../_shared/slug.ts'

interface ManageProjectsParams {
  action: string
  project_id?: string
  name?: string
}

export async function handleManageProjects(
  params: ManageProjectsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') return mcpError(insufficientManagerScopeError())

  switch (params.action) {
    case 'create':
      return await createProject(params, ctx, supabase)
    case 'rename':
      return await renameProject(params, ctx, supabase)
    case 'archive':
      return await archiveProject(params, ctx, supabase)
    default:
      return mcpError(validationError({ action: `Invalid action: ${params.action}` }))
  }
}

async function createProject(
  params: ManageProjectsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.name) {
    return mcpError(validationError({ name: 'Name is required when creating a project.' }))
  }

  const fieldErrors = validateProjectInput({ name: params.name })
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  const baseSlug = generateSlug(params.name)
  const slug = await ensureUniqueSlug(supabase, baseSlug, 'projects')

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: params.name.trim(),
      slug,
      is_archived: false,
    })
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'project',
    targetId: data.id,
    eventType: 'project_created',
    newValue: { name: data.name, slug: data.slug },
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

async function renameProject(
  params: ManageProjectsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.project_id) {
    return mcpError(validationError({ project_id: 'project_id is required for rename.' }))
  }
  if (!params.name) {
    return mcpError(validationError({ name: 'Name is required for rename.' }))
  }

  const fieldErrors = validateProjectInput({ name: params.name })
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // Get old record for logging
  const { data: oldRecord, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.project_id)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (fetchError || !oldRecord) {
    return mcpError({ code: 'invalid_project', message: `Project "${params.project_id}" not found.` })
  }

  const baseSlug = generateSlug(params.name)
  const slug = await ensureUniqueSlug(supabase, baseSlug, 'projects', params.project_id)

  const { data, error } = await supabase
    .from('projects')
    .update({ name: params.name.trim(), slug })
    .eq('id', params.project_id)
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'project',
    targetId: params.project_id,
    eventType: 'project_renamed',
    oldValue: { name: oldRecord.name, slug: oldRecord.slug },
    newValue: { name: data.name, slug: data.slug },
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

async function archiveProject(
  params: ManageProjectsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.project_id) {
    return mcpError(validationError({ project_id: 'project_id is required for archive.' }))
  }

  const { data, error } = await supabase
    .from('projects')
    .update({ is_archived: true })
    .eq('id', params.project_id)
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'project',
    targetId: params.project_id,
    eventType: 'project_archived',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}
