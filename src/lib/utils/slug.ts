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
