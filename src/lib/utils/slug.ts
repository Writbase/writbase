import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generate a URL-friendly slug from a name.
 * Matches the Edge Function implementation in supabase/functions/_shared/slug.ts.
 */
export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    throw new Error(`Cannot generate slug from name: "${name}" contains no URL-safe characters`);
  }

  return slug;
}

const MAX_SLUG_RETRIES = 3;

/**
 * Attempt an INSERT, retrying with a suffixed slug on unique constraint
 * violation (Postgres error 23505). This avoids the TOCTOU race condition
 * inherent in SELECT-then-INSERT.
 *
 * If the conflict is on (name) rather than (slug), throws a user-facing error.
 */
export async function insertWithUniqueSlug(
  supabase: SupabaseClient,
  table: string,
  data: Record<string, unknown>,
  baseSlug: string,
  maxRetries = MAX_SLUG_RETRIES,
): Promise<Record<string, unknown>> {
  let slug = baseSlug;
  let suffix = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await supabase
      .from(table)
      .insert({ ...data, slug })
      .select()
      .single();

    if (!result.error) return result.data as Record<string, unknown>;

    const err = result.error;
    if (err.code === '23505') {
      const details = err.details;
      const message = err.message;
      if (details.includes('(name)') || message.includes('(name)')) {
        throw new Error(`A ${table.slice(0, -1)} with this name already exists.`);
      }
      // Slug conflict — retry with suffix
      suffix++;
      slug = `${baseSlug}-${suffix}`;
      continue;
    }

    throw err;
  }

  throw new Error(
    `Could not generate unique slug for "${baseSlug}" in "${table}" after ${maxRetries} retries`,
  );
}
