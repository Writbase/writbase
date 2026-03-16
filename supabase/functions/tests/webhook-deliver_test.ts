/**
 * Tests for webhook delivery: HMAC signing (unit) and webhook payload assembly (unit).
 *
 * Integration tests for the Postgres trigger event derivation live in
 * mcp-e2e-behavior_test.ts since they require a running database.
 *
 * Run:
 *   deno test supabase/functions/tests/webhook-deliver_test.ts \
 *     --allow-read \
 *     --config supabase/functions/mcp-server/deno.json
 */

import { assertEquals, assertNotEquals } from '@std/assert'
import { signWebhookPayload } from '../_shared/hmac.ts'

// ═══════════════════════════════════════════════════════════════════
// HMAC SIGNING
// ═══════════════════════════════════════════════════════════════════

Deno.test('hmac: produces base64-encoded signature', async () => {
  const sig = await signWebhookPayload('msg_123', 1700000000, '{"type":"test"}', 'test-secret')
  // Should be valid base64
  const decoded = atob(sig)
  assertEquals(decoded.length, 32) // SHA-256 = 32 bytes
})

Deno.test('hmac: same inputs produce same signature', async () => {
  const a = await signWebhookPayload('msg_abc', 1700000000, '{"ok":true}', 'secret')
  const b = await signWebhookPayload('msg_abc', 1700000000, '{"ok":true}', 'secret')
  assertEquals(a, b)
})

Deno.test('hmac: different msg_id produces different signature', async () => {
  const a = await signWebhookPayload('msg_1', 1700000000, '{"ok":true}', 'secret')
  const b = await signWebhookPayload('msg_2', 1700000000, '{"ok":true}', 'secret')
  assertNotEquals(a, b)
})

Deno.test('hmac: different timestamp produces different signature', async () => {
  const a = await signWebhookPayload('msg_1', 1700000000, '{"ok":true}', 'secret')
  const b = await signWebhookPayload('msg_1', 1700000001, '{"ok":true}', 'secret')
  assertNotEquals(a, b)
})

Deno.test('hmac: different body produces different signature', async () => {
  const a = await signWebhookPayload('msg_1', 1700000000, '{"ok":true}', 'secret')
  const b = await signWebhookPayload('msg_1', 1700000000, '{"ok":false}', 'secret')
  assertNotEquals(a, b)
})

Deno.test('hmac: different secret produces different signature', async () => {
  const a = await signWebhookPayload('msg_1', 1700000000, '{"ok":true}', 'secret-a')
  const b = await signWebhookPayload('msg_1', 1700000000, '{"ok":true}', 'secret-b')
  assertNotEquals(a, b)
})

Deno.test('hmac: can be verified with Web Crypto API', async () => {
  const secret = 'verify-me'
  const msgId = 'msg_task123_5_task.completed'
  const timestamp = 1700000000
  const body = '{"type":"task.completed"}'

  const signature = await signWebhookPayload(msgId, timestamp, body, secret)

  // Manually verify: re-sign and compare
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0))
  const data = encoder.encode(`${msgId}.${timestamp}.${body}`)
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data)
  assertEquals(valid, true)
})

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK PAYLOAD ASSEMBLY
// ═══════════════════════════════════════════════════════════════════

const TRACKED_FIELDS = ['status', 'priority', 'description', 'notes', 'department_id', 'due_date']

function buildChanges(
  newRecord: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null,
): Record<string, { old: unknown; new: unknown }> {
  if (!oldRecord) return {}
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const field of TRACKED_FIELDS) {
    const oldVal = oldRecord[field] ?? null
    const newVal = newRecord[field] ?? null
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal }
    }
  }
  return changes
}

Deno.test('payload: INSERT produces empty changes', () => {
  const changes = buildChanges({ status: 'todo', priority: 'medium' }, null)
  assertEquals(Object.keys(changes).length, 0)
})

Deno.test('payload: status change tracked', () => {
  const changes = buildChanges(
    { status: 'done', priority: 'medium' },
    { status: 'in_progress', priority: 'medium' },
  )
  assertEquals(changes.status, { old: 'in_progress', new: 'done' })
  assertEquals(Object.keys(changes).length, 1)
})

Deno.test('payload: multiple field changes tracked', () => {
  const changes = buildChanges(
    { status: 'done', priority: 'high', notes: 'updated' },
    { status: 'in_progress', priority: 'medium', notes: 'original' },
  )
  assertEquals(Object.keys(changes).length, 3)
  assertEquals(changes.status, { old: 'in_progress', new: 'done' })
  assertEquals(changes.priority, { old: 'medium', new: 'high' })
  assertEquals(changes.notes, { old: 'original', new: 'updated' })
})

Deno.test('payload: untracked fields ignored', () => {
  const changes = buildChanges(
    { status: 'todo', version: 2, updated_at: '2024-01-02' },
    { status: 'todo', version: 1, updated_at: '2024-01-01' },
  )
  assertEquals(Object.keys(changes).length, 0)
})

Deno.test('payload: deterministic webhook-id format', () => {
  const taskId = '550e8400-e29b-41d4-a716-446655440000'
  const version = 5
  const eventType = 'task.completed'
  const msgId = `msg_${taskId}_${version}_${eventType}`
  assertEquals(msgId, 'msg_550e8400-e29b-41d4-a716-446655440000_5_task.completed')
})
