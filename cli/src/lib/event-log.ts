import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorType, EventCategory, Source, TargetType } from './types.js';

export async function logEvent(
  supabase: SupabaseClient,
  params: {
    eventCategory: EventCategory;
    targetType: TargetType;
    targetId: string;
    eventType: string;
    fieldName?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    actorType: ActorType;
    actorId: string;
    actorLabel: string;
    source: Source;
    workspaceId: string;
  },
) {
  const { error } = await supabase.from('event_log').insert({
    event_category: params.eventCategory,
    target_type: params.targetType,
    target_id: params.targetId,
    event_type: params.eventType,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    actor_type: params.actorType,
    actor_id: params.actorId,
    actor_label: params.actorLabel,
    source: params.source,
    workspace_id: params.workspaceId,
  });

  if (error) {
    console.error(
      'Failed to log event:',
      JSON.stringify({
        event_type: params.eventType,
        target_id: params.targetId,
        error: error.message,
      }),
    );
  }
}
