import type { Priority, Status } from './types.ts'

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
const VALID_STATUSES: Status[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled', 'failed']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate an array of UUIDs. Returns an error message or null if valid.
 */
export function validateUuidArray(arr: unknown[], fieldName: string): string | null {
  if (arr.length > 20) {
    return `${fieldName} cannot contain more than 20 items.`
  }
  for (const item of arr) {
    if (typeof item !== 'string' || !UUID_RE.test(item)) {
      return `${fieldName} must contain valid UUIDs.`
    }
  }
  return null
}

const ISO_DATE_RE =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/

/**
 * Validate an ISO 8601 date string. Two-step: regex format check then
 * Date roundtrip to verify calendar correctness (catches Feb 30 etc.).
 */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false

  // Extract year/month/day and verify via Date roundtrip
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

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
    if (typeof input.due_date !== 'string' || !isValidISODate(input.due_date)) {
      errors.due_date = 'due_date must be a valid ISO 8601 date string (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).'
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
