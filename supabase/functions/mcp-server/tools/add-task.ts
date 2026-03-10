import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext } from '../../_shared/types.ts'
import {
  invalidProjectError,
  invalidDepartmentError,
  scopeNotAllowedError,
  validationError,
} from '../../_shared/errors.ts'
import { validateTaskInput } from '../../_shared/validation.ts'
import { logEvent } from '../../_shared/event-log.ts'

interface AddTaskParams {
  project: string
  department?: string
  priority?: string
  description: string
  notes?: string
  due_date?: string
  status?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mcpError(error: { code: string; message: string; recovery?: string; fields?: Record<string, string>; [k: string]: unknown }) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(error) }],
    isError: true,
  }
}

export async function handleAddTask(
  params: AddTaskParams,
  ctx: AgentContext,
  supabase: SupabaseClient
) {
  // 1. Resolve project (slug or UUID) from ctx.permissions
  const isUuid = UUID_RE.test(params.project)
  const projectPerms = ctx.permissions.filter((p) =>
    isUuid ? p.projectId === params.project : p.projectSlug === params.project
  )

  if (projectPerms.length === 0) {
    return mcpError(invalidProjectError(params.project))
  }

  const projectId = projectPerms[0].projectId

  // 2. Reject if project is archived
  if (projectPerms[0].isProjectArchived) {
    return mcpError({
      code: 'invalid_project',
      message: `Project "${params.project}" is archived.`,
      recovery: 'This project is archived. No new tasks can be created.',
    })
  }

  // 3. Check agent has can_create for this project scope
  const hasCreate = projectPerms.some((p) => p.canCreate)
  if (!hasCreate) {
    return mcpError(scopeNotAllowedError(params.project, 'create'))
  }

  // 4. Resolve department if provided
  let departmentId: string | null = null
  if (params.department) {
    const isDeptUuid = UUID_RE.test(params.department)

    // Check if agent has project-wide permission (departmentId IS NULL)
    const hasProjectWide = projectPerms.some((p) => p.departmentId === null && p.canCreate)
    const deptPerm = projectPerms.find((p) =>
      isDeptUuid
        ? p.departmentId === params.department
        : p.departmentSlug === params.department
    )

    if (!hasProjectWide && !deptPerm) {
      return mcpError(scopeNotAllowedError(params.project, 'create'))
    }

    if (deptPerm) {
      if (deptPerm.isDepartmentArchived) {
        return mcpError(invalidDepartmentError(params.department))
      }
      departmentId = deptPerm.departmentId
    } else {
      // Agent has project-wide access; resolve the department slug/UUID to an ID
      if (isDeptUuid) {
        // Verify the department exists and is not archived
        const { data: dept } = await supabase
          .from('departments')
          .select('id, is_archived')
          .eq('id', params.department)
          .single()

        if (!dept || dept.is_archived) {
          return mcpError(invalidDepartmentError(params.department))
        }
        departmentId = dept.id
      } else {
        const { data: dept } = await supabase
          .from('departments')
          .select('id, is_archived')
          .eq('slug', params.department)
          .single()

        if (!dept || dept.is_archived) {
          return mcpError(invalidDepartmentError(params.department))
        }
        departmentId = dept.id
      }
    }
  } else {
    // 5. If department not provided, check if department_required
    const { data: settings } = await supabase
      .from('app_settings')
      .select('department_required')
      .single()

    if (settings?.department_required) {
      return mcpError(validationError({ department: 'Department is required by system settings.' }))
    }
  }

  // 6. Validate task fields
  const fieldsToValidate: Record<string, unknown> = { description: params.description }
  if (params.priority !== undefined) fieldsToValidate.priority = params.priority
  if (params.status !== undefined) fieldsToValidate.status = params.status
  if (params.due_date !== undefined) fieldsToValidate.due_date = params.due_date

  const fieldErrors = validateTaskInput(fieldsToValidate)
  if (fieldErrors) {
    return mcpError(validationError(fieldErrors))
  }

  // 7. Insert task
  const { data: task, error: insertError } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      department_id: departmentId,
      priority: params.priority ?? 'medium',
      description: params.description.trim(),
      notes: params.notes ?? null,
      due_date: params.due_date ?? null,
      status: params.status ?? 'todo',
      created_by_type: 'agent',
      created_by_id: ctx.keyId,
      updated_by_type: 'agent',
      updated_by_id: ctx.keyId,
      source: 'mcp',
    })
    .select()
    .single()

  if (insertError) {
    return mcpError({
      code: 'internal_error',
      message: insertError.message,
    })
  }

  // 8. Log event
  await logEvent(supabase, {
    eventCategory: 'task',
    targetType: 'task',
    targetId: task.id,
    eventType: 'task_created',
    actorType: 'agent',
    actorId: ctx.keyId,
    actorLabel: ctx.name,
    source: 'mcp',
  })

  // 9. Return created task with version: 1
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ...task, version: task.version ?? 1 }) }],
  }
}
