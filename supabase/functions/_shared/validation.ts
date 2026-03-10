import type { Priority, Status } from './types.ts'

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
const VALID_STATUSES: Status[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled']

/**
 * Validate task creation/update input. Returns a map of field -> error message
 * for any invalid fields, or null if everything is valid.
 */
export function validateTaskInput(input: Record<string, unknown>): Record<string, string> | null {
  const errors: Record<string, string> = {}

  if ('description' in input) {
    if (typeof input.description !== 'string' || input.description.trim().length < 3) {
      errors.description = 'Description must be at least 3 characters.'
    }
  }

  if ('priority' in input) {
    if (!VALID_PRIORITIES.includes(input.priority as Priority)) {
      errors.priority = `Priority must be one of: ${VALID_PRIORITIES.join(', ')}.`
    }
  }

  if ('status' in input) {
    if (!VALID_STATUSES.includes(input.status as Status)) {
      errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`
    }
  }

  if ('due_date' in input && input.due_date !== null) {
    const parsed = Date.parse(input.due_date as string)
    if (isNaN(parsed)) {
      errors.due_date = 'due_date must be a valid ISO 8601 date string.'
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}

/**
 * Validate project creation/update input.
 */
export function validateProjectInput(input: Record<string, unknown>): Record<string, string> | null {
  const errors: Record<string, string> = {}

  if ('name' in input) {
    if (typeof input.name !== 'string' || input.name.trim().length < 1) {
      errors.name = 'Project name is required.'
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}

/**
 * Validate department creation/update input.
 */
export function validateDepartmentInput(input: Record<string, unknown>): Record<string, string> | null {
  const errors: Record<string, string> = {}

  if ('name' in input) {
    if (typeof input.name !== 'string' || input.name.trim().length < 1) {
      errors.name = 'Department name is required.'
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}
