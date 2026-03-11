/**
 * Encode a cursor from created_at timestamp and id.
 */
export function encodeCursor(createdAt: string, id: string): string {
  const json = JSON.stringify({ c: createdAt, i: id })
  return btoa(json)
}

/**
 * Decode a cursor back to created_at and id.
 * Returns null if the cursor is invalid.
 */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    if (cursor.length > 128) return null
    const json = atob(cursor)
    const parsed = JSON.parse(json)
    if (typeof parsed.c === 'string' && typeof parsed.i === 'string') {
      return { createdAt: parsed.c, id: parsed.i }
    }
    return null
  } catch {
    return null
  }
}
