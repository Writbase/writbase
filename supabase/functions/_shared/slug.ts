import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Generate a URL-friendly slug from a name.
 * Lowercase, replace spaces/special chars with hyphens, collapse multiples.
 * Throws if name produces no URL-safe characters.
 */
export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!slug) {
    throw new Error(`Cannot generate slug from name: "${name}" contains no URL-safe characters`)
  }

  return slug
}

const MAX_SLUG_ATTEMPTS = 100

/**
 * Ensure slug uniqueness by appending -N suffix if needed.
 * Throws on database errors or if uniqueness cannot be achieved.
 */
export async function ensureUniqueSlug(supabase: SupabaseClient, baseSlug: string, table: string, excludeId?: string): Promise<string> {
  let slug = baseSlug
  let suffix = 1

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    let query = supabase.from(table).select('id').eq('slug', slug)
    if (excludeId) {
      query = query.neq('id', excludeId)
    }
    const { data, error } = await query.limit(1)

    if (error) {
      throw new Error(`Failed to check slug uniqueness in "${table}": ${error.message}`)
    }

    if (!data || data.length === 0) {
      return slug
    }

    suffix++
    slug = `${baseSlug}-${suffix}`
  }

  throw new Error(`Could not generate unique slug for "${baseSlug}" in "${table}" after ${MAX_SLUG_ATTEMPTS} attempts`)
}
