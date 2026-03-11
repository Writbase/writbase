import { timingSafeEqual } from '@std/crypto/timing-safe-equal'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentContext, AgentKeyRecord, AgentPermission } from './types.ts'
import { unauthorizedError, inactiveKeyError } from './errors.ts'
import { logger } from './logger.ts'

/** Shape of a row returned by the permissions query with joined projects/departments. */
interface PermissionRow {
  id: string
  project_id: string
  department_id: string | null
  can_read: boolean
  can_create: boolean
  can_update: boolean
  projects: { slug: string; name: string; is_archived: boolean } | null
  departments: { slug: string; name: string; is_archived: boolean } | null
}

const KEY_PREFIX_RE = /^Bearer wb_([0-9a-f-]{36})_([0-9a-f]{64})$/

/**
 * Parse an agent key from the Authorization header.
 * Expected format: `Bearer wb_<uuid>_<64-hex-chars>`
 */
export function parseAgentKey(authHeader: string): { keyId: string; secret: string } {
  const match = authHeader.match(KEY_PREFIX_RE)
  if (!match) {
    throw unauthorizedError()
  }
  return { keyId: match[1], secret: match[2] }
}

/**
 * SHA-256 hash a secret string, returning the hex digest.
 */
export async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a new agent key with all derived fields.
 */
export async function generateAgentKey(): Promise<{
  fullKey: string
  keyId: string
  secret: string
  keyHash: string
  keyPrefix: string
}> {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const secret = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const keyId = crypto.randomUUID()
  const keyHash = await hashSecret(secret)
  const keyPrefix = secret.slice(0, 8)

  return {
    fullKey: `wb_${keyId}_${secret}`,
    keyId,
    secret,
    keyHash,
    keyPrefix,
  }
}

/**
 * Authenticate an agent by key_id and secret.
 * Returns the full AgentContext on success, throws a WritBaseError on failure.
 */
export async function authenticateAgent(
  supabase: SupabaseClient,
  keyId: string,
  secret: string
): Promise<AgentContext> {
  // Look up the key record
  const { data: keyRecord, error } = await supabase
    .from('agent_keys')
    .select('*')
    .eq('id', keyId)
    .abortSignal(AbortSignal.timeout(10_000))
    .single<AgentKeyRecord>()

  if (error || !keyRecord) {
    throw unauthorizedError()
  }

  if (!keyRecord.is_active) {
    throw inactiveKeyError()
  }

  // Hash the provided secret and compare timing-safely
  const providedHash = await hashSecret(secret)
  const providedBytes = new TextEncoder().encode(providedHash)
  const storedBytes = new TextEncoder().encode(keyRecord.key_hash)

  if (providedBytes.length !== storedBytes.length || !timingSafeEqual(providedBytes, storedBytes)) {
    throw unauthorizedError()
  }

  // Load permissions
  const permissions = await loadPermissions(supabase, keyId)

  // Fire-and-forget: update last_used_at
  supabase
    .from('agent_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId)
    .then(
      ({ error }) => {
        if (error) logger.error('last_used_at update failed', { agent_key_id: keyId, error: error.message })
      },
      (e: unknown) => logger.error('last_used_at update rejected', { agent_key_id: keyId, error: String(e) })
    )

  return {
    keyId: keyRecord.id,
    name: keyRecord.name,
    role: keyRecord.role,
    isActive: keyRecord.is_active,
    specialPrompt: keyRecord.special_prompt,
    permissions,
  }
}

/**
 * Load all permissions for an agent key, joining project and department info.
 */
export async function loadPermissions(
  supabase: SupabaseClient,
  keyId: string
): Promise<AgentPermission[]> {
  const { data, error } = await supabase
    .from('agent_permissions')
    .select(`
      id,
      project_id,
      department_id,
      can_read,
      can_create,
      can_update,
      projects:project_id ( slug, name, is_archived ),
      departments:department_id ( slug, name, is_archived )
    `)
    .eq('agent_key_id', keyId)
    .abortSignal(AbortSignal.timeout(10_000))

  if (error) {
    throw new Error(`Failed to load permissions: ${error.message}`)
  }

  return ((data ?? []) as unknown as PermissionRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    projectSlug: row.projects?.slug ?? '',
    projectName: row.projects?.name ?? '',
    departmentId: row.department_id,
    departmentSlug: row.departments?.slug ?? null,
    departmentName: row.departments?.name ?? null,
    canRead: row.can_read,
    canCreate: row.can_create,
    canUpdate: row.can_update,
    isProjectArchived: row.projects?.is_archived ?? false,
    isDepartmentArchived: row.departments?.is_archived ?? null,
  }))
}
