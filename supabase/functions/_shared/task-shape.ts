const COMPACT_KEYS = [
  'id',
  'version',
  'status',
  'priority',
  'description',
  'due_date',
  'updated_at',
  'created_at',
  'department_id',
] as const

/** Strip a task to the 9 fields needed for listing views. */
export function compactTask(
  task: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of COMPACT_KEYS) {
    out[key] = task[key] ?? null
  }
  return out
}

/** Map compactTask over an array. */
export function compactTasks(
  tasks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return tasks.map(compactTask)
}
