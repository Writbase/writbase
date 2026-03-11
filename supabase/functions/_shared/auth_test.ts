import { assertEquals } from '@std/assert'
import { parseAgentKey, hashSecret, generateAgentKey } from './auth.ts'

// ── parseAgentKey() ─────────────────────────────────────────────────────

Deno.test('parseAgentKey extracts keyId and secret from valid header', () => {
  const keyId = '12345678-1234-1234-1234-123456789abc'
  const secret = 'a'.repeat(64)
  const header = `Bearer wb_${keyId}_${secret}`

  const result = parseAgentKey(header)
  assertEquals(result.keyId, keyId)
  assertEquals(result.secret, secret)
})

Deno.test('parseAgentKey throws on missing Bearer prefix', () => {
  const keyId = '12345678-1234-1234-1234-123456789abc'
  const secret = 'a'.repeat(64)

  try {
    parseAgentKey(`wb_${keyId}_${secret}`)
    throw new Error('should have thrown')
  } catch (e: unknown) {
    assertEquals((e as { code: string }).code, 'unauthorized_agent_key')
  }
})

Deno.test('parseAgentKey throws on invalid key format', () => {
  try {
    parseAgentKey('Bearer invalid-key')
    throw new Error('should have thrown')
  } catch (e: unknown) {
    assertEquals((e as { code: string }).code, 'unauthorized_agent_key')
  }
})

Deno.test('parseAgentKey throws on short secret (not 64 hex chars)', () => {
  const keyId = '12345678-1234-1234-1234-123456789abc'
  const shortSecret = 'a'.repeat(32)

  try {
    parseAgentKey(`Bearer wb_${keyId}_${shortSecret}`)
    throw new Error('should have thrown')
  } catch (e: unknown) {
    assertEquals((e as { code: string }).code, 'unauthorized_agent_key')
  }
})

Deno.test('parseAgentKey throws on empty string', () => {
  try {
    parseAgentKey('')
    throw new Error('should have thrown')
  } catch (e: unknown) {
    assertEquals((e as { code: string }).code, 'unauthorized_agent_key')
  }
})

// ── hashSecret() ────────────────────────────────────────────────────────

Deno.test('hashSecret returns 64-char hex string', async () => {
  const hash = await hashSecret('test-secret')
  assertEquals(hash.length, 64)
  assertEquals(/^[0-9a-f]{64}$/.test(hash), true)
})

Deno.test('hashSecret is deterministic', async () => {
  const hash1 = await hashSecret('same-input')
  const hash2 = await hashSecret('same-input')
  assertEquals(hash1, hash2)
})

Deno.test('hashSecret produces different output for different input', async () => {
  const hash1 = await hashSecret('input-a')
  const hash2 = await hashSecret('input-b')
  assertEquals(hash1 !== hash2, true)
})

// ── generateAgentKey() ──────────────────────────────────────────────────

Deno.test('generateAgentKey returns all required fields', async () => {
  const key = await generateAgentKey()

  assertEquals(typeof key.fullKey, 'string')
  assertEquals(typeof key.keyId, 'string')
  assertEquals(typeof key.secret, 'string')
  assertEquals(typeof key.keyHash, 'string')
  assertEquals(typeof key.keyPrefix, 'string')
})

Deno.test('generateAgentKey fullKey matches expected format', async () => {
  const key = await generateAgentKey()

  assertEquals(key.fullKey, `wb_${key.keyId}_${key.secret}`)
  assertEquals(key.fullKey.startsWith('wb_'), true)
})

Deno.test('generateAgentKey secret is 64 hex chars', async () => {
  const key = await generateAgentKey()
  assertEquals(key.secret.length, 64)
  assertEquals(/^[0-9a-f]{64}$/.test(key.secret), true)
})

Deno.test('generateAgentKey keyPrefix is first 8 chars of secret', async () => {
  const key = await generateAgentKey()
  assertEquals(key.keyPrefix, key.secret.slice(0, 8))
})

Deno.test('generateAgentKey keyHash matches hashSecret(secret)', async () => {
  const key = await generateAgentKey()
  const expectedHash = await hashSecret(key.secret)
  assertEquals(key.keyHash, expectedHash)
})

Deno.test('generateAgentKey keyId is a valid UUID', async () => {
  const key = await generateAgentKey()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  assertEquals(uuidRe.test(key.keyId), true)
})

Deno.test('generateAgentKey produces unique keys', async () => {
  const key1 = await generateAgentKey()
  const key2 = await generateAgentKey()
  assertEquals(key1.keyId !== key2.keyId, true)
  assertEquals(key1.secret !== key2.secret, true)
})

Deno.test('generated key can be parsed back by parseAgentKey', async () => {
  const key = await generateAgentKey()
  const parsed = parseAgentKey(`Bearer ${key.fullKey}`)
  assertEquals(parsed.keyId, key.keyId)
  assertEquals(parsed.secret, key.secret)
})
