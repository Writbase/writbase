import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorType, EventCategory, Source, TargetType } from './types.ts'
import { logger } from './logger.ts'

export interface LogEventParams {
  eventCategory: EventCategory
  targetType: TargetType
  targetId: string
  eventType: string
  fieldName?: string
  oldValue?: unknown
  newValue?: unknown
  actorType: ActorType
  actorId: string
  actorLabel: string
  source: Source
  workspaceId: string
}

/**
 * Insert a single event_log row.
 *
 * When `critical` is true (default for admin events), a logging failure
 * throws so the parent mutation is rolled back — preserving the provenance
 * guarantee.  Non-critical failures are logged and swallowed.
 */
export async function logEvent(
  supabase: SupabaseClient,
  params: LogEventParams,
  opts?: { critical?: boolean }
): Promise<void> {
  const critical = opts?.critical ?? params.eventCategory === 'admin'

  const { error } = await supabase.from('event_log').insert({
    event_category: params.eventCategory,
    target_type: params.targetType,
    target_id: params.targetId,
    event_type: params.eventType,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
    new_value: params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    actor_type: params.actorType,
    actor_id: params.actorId,
    actor_label: params.actorLabel,
    source: params.source,
    workspace_id: params.workspaceId,
  })

  if (error) {
    logger.error('Failed to log event', { event_type: params.eventType, target_id: params.targetId, error: error.message })
    if (critical) {
      throw new Error(`Critical audit log failure: ${error.message}`)
    }
  }
}

export interface LogFieldChangesParams {
  eventCategory: EventCategory
  targetType: TargetType
  targetId: string
  eventType: string
  oldRecord: Record<string, unknown>
  newRecord: Record<string, unknown>
  trackedFields: string[]
  actorType: ActorType
  actorId: string
  actorLabel: string
  source: Source
  workspaceId: string
}

/**
 * Compare old and new objects field by field. Create one event_log row per
 * changed field from the tracked set.
 */
export async function logFieldChanges(
  supabase: SupabaseClient,
  params: LogFieldChangesParams,
  opts?: { critical?: boolean }
): Promise<void> {
  const critical = opts?.critical ?? params.eventCategory === 'admin'
  const rows = []

  for (const field of params.trackedFields) {
    const oldVal = params.oldRecord[field]
    const newVal = params.newRecord[field]

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      rows.push({
        event_category: params.eventCategory,
        target_type: params.targetType,
        target_id: params.targetId,
        event_type: params.eventType,
        field_name: field,
        old_value: oldVal !== undefined ? JSON.stringify(oldVal) : null,
        new_value: newVal !== undefined ? JSON.stringify(newVal) : null,
        actor_type: params.actorType,
        actor_id: params.actorId,
        actor_label: params.actorLabel,
        source: params.source,
        workspace_id: params.workspaceId,
      })
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('event_log').insert(rows)
    if (error) {
      logger.error('Failed to log field changes', { event_type: params.eventType, target_id: params.targetId, error: error.message })
      if (critical) {
        throw new Error(`Critical audit log failure: ${error.message}`)
      }
    }
  }
}
