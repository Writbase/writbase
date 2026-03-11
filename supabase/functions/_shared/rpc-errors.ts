/**
 * Parse the 'error_code:message' format from Postgres RAISE EXCEPTION.
 * Returns the error code prefix, or null if the format doesn't match.
 */
export function parseRpcErrorCode(message: string): string | null {
  const colonIndex = message.indexOf(':')
  if (colonIndex === -1) return null
  return message.slice(0, colonIndex)
}

/**
 * Extract the current version number from a version_conflict error message.
 * Handles two Postgres formats:
 *   'version_conflict:Version conflict: expected 1, current is 2'
 *   'version_conflict:Task was modified concurrently' (no version)
 */
export function parseVersionFromError(message: string): number | null {
  const match = message.match(/current is (\d+)/)
  return match ? Number(match[1]) : null
}
