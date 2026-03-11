import { assertEquals } from '@std/assert'
import {
  mcpError,
  unauthorizedError,
  inactiveKeyError,
  scopeNotAllowedError,
  invalidProjectError,
  invalidDepartmentError,
  taskNotFoundError,
  updateNotAllowedError,
  validationError,
  versionConflictError,
  rateLimitedError,
  insufficientManagerScopeError,
  selfModificationDeniedError,
  ErrorCodes,
} from './errors.ts'

// ── mcpError() ──────────────────────────────────────────────────────────

Deno.test('mcpError returns isError: true with JSON-serialized content', () => {
  const result = mcpError({ code: 'test_error', message: 'Something broke' })

  assertEquals(result.isError, true)
  assertEquals(result.content.length, 1)
  assertEquals(result.content[0].type, 'text')

  const parsed = JSON.parse(result.content[0].text)
  assertEquals(parsed.code, 'test_error')
  assertEquals(parsed.message, 'Something broke')
})

Deno.test('mcpError preserves extra properties via index signature', () => {
  const result = mcpError({
    code: 'version_conflict',
    message: 'Conflict',
    current_version: 5,
    recovery: 'Re-fetch',
    fields: { name: 'too long' },
  })

  const parsed = JSON.parse(result.content[0].text)
  assertEquals(parsed.current_version, 5)
  assertEquals(parsed.recovery, 'Re-fetch')
  assertEquals(parsed.fields.name, 'too long')
})

// ── Error factory functions ─────────────────────────────────────────────

Deno.test('unauthorizedError has correct code', () => {
  const err = unauthorizedError()
  assertEquals(err.code, ErrorCodes.UNAUTHORIZED)
  assertEquals(typeof err.message, 'string')
  assertEquals(typeof err.recovery, 'string')
})

Deno.test('inactiveKeyError has correct code', () => {
  const err = inactiveKeyError()
  assertEquals(err.code, ErrorCodes.INACTIVE_KEY)
})

Deno.test('scopeNotAllowedError includes project and action', () => {
  const err = scopeNotAllowedError('my-project', 'create')
  assertEquals(err.code, ErrorCodes.SCOPE_NOT_ALLOWED)
  assertEquals(err.message.includes('my-project'), true)
  assertEquals(err.message.includes('create'), true)
})

Deno.test('invalidProjectError includes project slug', () => {
  const err = invalidProjectError('acme-corp')
  assertEquals(err.code, ErrorCodes.INVALID_PROJECT)
  assertEquals(err.message.includes('acme-corp'), true)
})

Deno.test('invalidDepartmentError includes department slug', () => {
  const err = invalidDepartmentError('engineering')
  assertEquals(err.code, ErrorCodes.INVALID_DEPARTMENT)
  assertEquals(err.message.includes('engineering'), true)
})

Deno.test('taskNotFoundError includes task ID', () => {
  const err = taskNotFoundError('abc-123')
  assertEquals(err.code, ErrorCodes.TASK_NOT_FOUND)
  assertEquals(err.message.includes('abc-123'), true)
})

Deno.test('updateNotAllowedError includes reason', () => {
  const err = updateNotAllowedError('task is locked')
  assertEquals(err.code, ErrorCodes.UPDATE_NOT_ALLOWED)
  assertEquals(err.message.includes('task is locked'), true)
})

Deno.test('validationError includes fields', () => {
  const err = validationError({ name: 'too short', priority: 'invalid' })
  assertEquals(err.code, ErrorCodes.VALIDATION_ERROR)
  assertEquals(err.fields?.name, 'too short')
  assertEquals(err.fields?.priority, 'invalid')
})

Deno.test('versionConflictError includes current version', () => {
  const err = versionConflictError(7)
  assertEquals(err.code, ErrorCodes.VERSION_CONFLICT)
  assertEquals(err.current_version, 7)
})

Deno.test('rateLimitedError includes retry_after', () => {
  const err = rateLimitedError(42)
  assertEquals(err.code, ErrorCodes.RATE_LIMITED)
  assertEquals(err.retry_after, 42)
})

Deno.test('insufficientManagerScopeError has correct code', () => {
  const err = insufficientManagerScopeError()
  assertEquals(err.code, ErrorCodes.INSUFFICIENT_MANAGER_SCOPE)
})

Deno.test('selfModificationDeniedError has correct code', () => {
  const err = selfModificationDeniedError()
  assertEquals(err.code, ErrorCodes.SELF_MODIFICATION_DENIED)
})

// ── mcpError integrates with factory functions ──────────────────────────

Deno.test('mcpError wraps factory errors correctly', () => {
  const err = versionConflictError(3)
  const result = mcpError(err)

  assertEquals(result.isError, true)
  const parsed = JSON.parse(result.content[0].text)
  assertEquals(parsed.code, ErrorCodes.VERSION_CONFLICT)
  assertEquals(parsed.current_version, 3)
  assertEquals(parsed.recovery, err.recovery)
})
