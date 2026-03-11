import { assertEquals } from '@std/assert'
import { isValidISODate, validateTaskInput } from './validation.ts'

// ── isValidISODate ───────────────────────────────────────────────────

Deno.test('isValidISODate: accepts YYYY-MM-DD format', () => {
  assertEquals(isValidISODate('2025-03-11'), true)
  assertEquals(isValidISODate('2000-01-01'), true)
  assertEquals(isValidISODate('2025-12-31'), true)
})

Deno.test('isValidISODate: accepts full ISO 8601 with time and timezone', () => {
  assertEquals(isValidISODate('2025-03-11T14:30:00Z'), true)
  assertEquals(isValidISODate('2025-03-11T14:30:00+05:30'), true)
  assertEquals(isValidISODate('2025-03-11T00:00:00-08:00'), true)
  assertEquals(isValidISODate('2025-03-11T23:59:59.999Z'), true)
})

Deno.test('isValidISODate: rejects loose formats', () => {
  assertEquals(isValidISODate('1'), false)
  assertEquals(isValidISODate('10/15/2025'), false)
  assertEquals(isValidISODate('2025-3-11'), false)
  assertEquals(isValidISODate('March 11 2025'), false)
  assertEquals(isValidISODate('2025/03/11'), false)
  assertEquals(isValidISODate(''), false)
})

Deno.test('isValidISODate: rejects impossible calendar dates', () => {
  assertEquals(isValidISODate('2025-02-30'), false)
  assertEquals(isValidISODate('2025-04-31'), false)
  assertEquals(isValidISODate('2025-13-01'), false)
  assertEquals(isValidISODate('2025-00-01'), false)
})

Deno.test('isValidISODate: handles leap year correctly', () => {
  assertEquals(isValidISODate('2024-02-29'), true)  // 2024 is a leap year
  assertEquals(isValidISODate('2025-02-29'), false)  // 2025 is not
})

// ── validateTaskInput with strict dates ──────────────────────────────

Deno.test('validateTaskInput: rejects loose date strings', () => {
  const errors = validateTaskInput({ due_date: '1' })
  assertEquals(errors !== null, true)
  assertEquals(errors!.due_date !== undefined, true)
})

Deno.test('validateTaskInput: accepts valid ISO date', () => {
  const errors = validateTaskInput({ due_date: '2025-03-11' })
  assertEquals(errors, null)
})

Deno.test('validateTaskInput: accepts null due_date', () => {
  const errors = validateTaskInput({ due_date: null })
  assertEquals(errors, null)
})
