import { assertEquals } from '@std/assert'
import { parseRpcErrorCode, parseVersionFromError } from './rpc-errors.ts'

Deno.test('parseRpcErrorCode: extracts code before first colon', () => {
  assertEquals(parseRpcErrorCode('project_not_found:Project not found'), 'project_not_found')
  assertEquals(parseRpcErrorCode('version_conflict:Version conflict: expected 1, current is 3'), 'version_conflict')
  assertEquals(parseRpcErrorCode('department_archived:Cannot create tasks in an archived department'), 'department_archived')
})

Deno.test('parseRpcErrorCode: returns null for messages without colon', () => {
  assertEquals(parseRpcErrorCode('some error without code'), null)
  assertEquals(parseRpcErrorCode(''), null)
})

Deno.test('parseVersionFromError: extracts version from conflict message', () => {
  assertEquals(parseVersionFromError('version_conflict:Version conflict: expected 1, current is 3'), 3)
  assertEquals(parseVersionFromError('version_conflict:Version conflict: expected 5, current is 12'), 12)
})

Deno.test('parseVersionFromError: returns null when no version in message', () => {
  assertEquals(parseVersionFromError('version_conflict:Task was modified concurrently'), null)
  assertEquals(parseVersionFromError('some other error'), null)
})
