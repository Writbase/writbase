import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ActorType, EventCategory, Source, TargetType } from './types.ts'

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
}

/**
 * Insert a single event_log row.
 */
export async function logEvent(
  supabase: SupabaseClient,
  params: LogEventParams
): Promise<void> {
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
  })

  if (error) {
    console.error('Failed to log event:', error.message)
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
}

/**
 * Compare old and new objects field by field. Create one event_log row per
 * changed field from the tracked set.
 */
export async function logFieldChanges(
  supabase: SupabaseClient,
  params: LogFieldChangesParams
): Promise<void> {
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
      })
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('event_log').insert(rows)
    if (error) {
      console.error('Failed to log field changes:', error.message)
    }
  }
}
