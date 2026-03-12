import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventLog } from '@/lib/types/database';
import type { ActorType, EventCategory, Source, TargetType } from '@/lib/types/enums';

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
  opts?: { critical?: boolean },
) {
  const critical = opts?.critical ?? params.eventCategory === 'admin';

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
    if (critical) {
      throw new Error(`Critical audit log failure: ${error.message}`);
    }
  }
}

export async function listEvents(
  supabase: SupabaseClient,
  filters: {
    targetId?: string;
    targetType?: TargetType;
    eventCategory?: EventCategory;
    limit?: number;
    offset?: number;
  } = {},
): Promise<EventLog[]> {
  let query = supabase.from('event_log').select('*').order('created_at', { ascending: false });

  if (filters.targetId) {
    query = query.eq('target_id', filters.targetId);
  }
  if (filters.targetType) {
    query = query.eq('target_type', filters.targetType);
  }
  if (filters.eventCategory) {
    query = query.eq('event_category', filters.eventCategory);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as EventLog[];
}
