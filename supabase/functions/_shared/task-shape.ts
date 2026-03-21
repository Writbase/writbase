import type { AgentPermission } from './types.ts'

const COMPACT_KEYS = [
  'id',
  'version',
  'status',
  'priority',
  'description',
  'due_date',
  'updated_at',
  'created_at',
  'session_id',
  'blocked_by',
] as const

/** Build UUID→slug lookup maps from agent permissions. */
export function buildSlugMaps(permissions: AgentPermission[]): {
  projects: Map<string, string>
  departments: Map<string, string>
} {
  const projects = new Map<string, string>()
  const departments = new Map<string, string>()
  for (const p of permissions) {
    if (p.projectId && p.projectSlug) projects.set(p.projectId, p.projectSlug)
    if (p.departmentId && p.departmentSlug) departments.set(p.departmentId, p.departmentSlug)
  }
  return { projects, departments }
}

/** Strip a task to compact fields, replacing UUIDs with slugs. */
export function compactTask(
  task: Record<string, unknown>,
  slugs?: { projects: Map<string, string>; departments: Map<string, string> },
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of COMPACT_KEYS) {
    out[key] = task[key] ?? null
  }
  // Replace UUID fields with human-readable slugs
  const deptId = task['department_id'] as string | null
  out['department'] = (deptId && slugs?.departments.get(deptId)) ?? deptId ?? null
  return out
}

/** Map compactTask over an array. */
export function compactTasks(
  tasks: Record<string, unknown>[],
  slugs?: { projects: Map<string, string>; departments: Map<string, string> },
): Record<string, unknown>[] {
  return tasks.map((t) => compactTask(t, slugs))
}
