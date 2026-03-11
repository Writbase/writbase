import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import { mcpError, insufficientManagerScopeError, validationError } from '../../_shared/errors.ts'
import { validateDepartmentInput } from '../../_shared/validation.ts'
import { logEvent } from '../../_shared/event-log.ts'
import { generateSlug, insertWithUniqueSlug, updateWithUniqueSlug } from '../../_shared/slug.ts'

interface ManageDepartmentsParams {
  action: string
  department_id?: string
  name?: string
}

export async function handleManageDepartments(
  params: ManageDepartmentsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (ctx.role !== 'manager') return mcpError(insufficientManagerScopeError())

  switch (params.action) {
    case 'create':
      return await createDepartment(params, ctx, supabase)
    case 'rename':
      return await renameDepartment(params, ctx, supabase)
    case 'archive':
      return await archiveDepartment(params, ctx, supabase)
    default:
      return mcpError(validationError({ action: `Invalid action: ${params.action}` }))
  }
}

async function createDepartment(
  params: ManageDepartmentsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.name) {
    return mcpError(validationError({ name: 'Name is required when creating a department.' }))
  }

  const fieldErrors = validateDepartmentInput({ name: params.name })
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  const baseSlug = generateSlug(params.name)

  let data: Record<string, unknown>
  try {
    data = await insertWithUniqueSlug(supabase, 'departments', {
      name: params.name.trim(),
      is_archived: false,
    }, baseSlug)
  } catch (err) {
    return mcpError({ code: 'internal_error', message: (err as Error).message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'department',
    targetId: data.id,
    eventType: 'department_created',
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

async function renameDepartment(
  params: ManageDepartmentsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.department_id) {
    return mcpError(validationError({ department_id: 'department_id is required for rename.' }))
  }
  if (!params.name) {
    return mcpError(validationError({ name: 'Name is required for rename.' }))
  }

  const fieldErrors = validateDepartmentInput({ name: params.name })
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // Get old record for logging
  const { data: oldRecord, error: fetchError } = await supabase
    .from('departments')
    .select('*')
    .eq('id', params.department_id)
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (fetchError || !oldRecord) {
    return mcpError({ code: 'invalid_department', message: `Department "${params.department_id}" not found.` })
  }

  const baseSlug = generateSlug(params.name)

  let data: Record<string, unknown>
  try {
    data = await updateWithUniqueSlug(supabase, 'departments', params.department_id, {
      name: params.name.trim(),
    }, baseSlug)
  } catch (err) {
    return mcpError({ code: 'internal_error', message: (err as Error).message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'department',
    targetId: params.department_id,
    eventType: 'department_renamed',
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

async function archiveDepartment(
  params: ManageDepartmentsParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  if (!params.department_id) {
    return mcpError(validationError({ department_id: 'department_id is required for archive.' }))
  }

  const { data, error } = await supabase
    .from('departments')
    .update({ is_archived: true })
    .eq('id', params.department_id)
    .select()
    .abortSignal(AbortSignal.timeout(10_000))
    .single()

  if (error) {
    return mcpError({ code: 'internal_error', message: error.message })
  }

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'department',
    targetId: params.department_id,
    eventType: 'department_archived',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}
