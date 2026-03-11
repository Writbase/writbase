import { assertEquals, assertThrows } from '@std/assert'
import { generateSlug } from './slug.ts'

// ── generateSlug() ──────────────────────────────────────────────────────

Deno.test('generateSlug lowercases input', () => {
  assertEquals(generateSlug('My Project'), 'my-project')
})

Deno.test('generateSlug replaces spaces with hyphens', () => {
  assertEquals(generateSlug('hello world'), 'hello-world')
})

Deno.test('generateSlug replaces special characters with hyphens', () => {
  assertEquals(generateSlug('hello@world!foo'), 'hello-world-foo')
})

Deno.test('generateSlug collapses multiple special chars into single hyphen', () => {
  assertEquals(generateSlug('hello   ---   world'), 'hello-world')
})

Deno.test('generateSlug strips leading and trailing hyphens', () => {
  assertEquals(generateSlug('  --hello-- '), 'hello')
})

Deno.test('generateSlug preserves numbers', () => {
  assertEquals(generateSlug('Project 42 Alpha'), 'project-42-alpha')
})

Deno.test('generateSlug handles unicode by replacing with hyphens', () => {
  assertEquals(generateSlug('café résumé'), 'caf-r-sum')
})

Deno.test('generateSlug trims whitespace', () => {
  assertEquals(generateSlug('  hello  '), 'hello')
})

// ── generateSlug() error cases ──────────────────────────────────────────

Deno.test('generateSlug throws on empty string', () => {
  assertThrows(() => generateSlug(''), Error, 'no URL-safe characters')
})

Deno.test('generateSlug throws on string of only special chars', () => {
  assertThrows(() => generateSlug('!@#$%'), Error, 'no URL-safe characters')
})

Deno.test('generateSlug throws on only whitespace', () => {
  assertThrows(() => generateSlug('   '), Error, 'no URL-safe characters')
})

Deno.test('generateSlug throws on non-Latin unicode only', () => {
  assertThrows(() => generateSlug('日本語'), Error, 'no URL-safe characters')
})
