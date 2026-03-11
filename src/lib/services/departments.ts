import type { SupabaseClient } from '@supabase/supabase-js';
import type { Department } from '@/lib/types/database';
import { generateSlug } from '@/lib/utils/slug';
import { logEvent } from './event-log';

export async function listDepartments(supabase: SupabaseClient): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Department[];
}

async function generateUniqueSlug(supabase: SupabaseClient, name: string): Promise<string> {
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let suffix = 1;

  for (;;) {
    const { data } = await supabase.from('departments').select('id').eq('slug', slug).limit(1);
    const rows = data as { id: string }[] | null;

    if (!rows || rows.length === 0) return slug;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function createDepartment(
  supabase: SupabaseClient,
  params: { name: string; createdBy: string },
): Promise<Department> {
  const slug = await generateUniqueSlug(supabase, params.name);

  const result = await supabase
    .from('departments')
    .insert({
      name: params.name,
      slug,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (result.error) throw result.error;
  const department = result.data as Department;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'department',
    targetId: department.id,
    eventType: 'department.created',
    actorType: 'human',
    actorId: params.createdBy,
    actorLabel: 'admin',
    source: 'ui',
  });

  return department;
}

export async function updateDepartment(
  supabase: SupabaseClient,
  params: { id: string; name?: string; isArchived?: boolean; actorId: string },
): Promise<Department> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.isArchived !== undefined) updates.is_archived = params.isArchived;

  const fetchResult = await supabase.from('departments').select('*').eq('id', params.id).single();

  if (fetchResult.error) throw fetchResult.error;
  const existing = fetchResult.data as Department;

  const updateResult = await supabase
    .from('departments')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (updateResult.error) throw updateResult.error;
  const updated = updateResult.data as Department;

  if (params.name !== undefined && params.name !== existing.name) {
    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'department',
      targetId: params.id,
      eventType: 'department.updated',
      fieldName: 'name',
      oldValue: existing.name,
      newValue: params.name,
      actorType: 'human',
      actorId: params.actorId,
      actorLabel: 'admin',
      source: 'ui',
    });
  }

  if (params.isArchived !== undefined && params.isArchived !== existing.is_archived) {
    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'department',
      targetId: params.id,
      eventType: params.isArchived ? 'department.archived' : 'department.unarchived',
      fieldName: 'is_archived',
      oldValue: existing.is_archived,
      newValue: params.isArchived,
      actorType: 'human',
      actorId: params.actorId,
      actorLabel: 'admin',
      source: 'ui',
    });
  }

  return updated;
}
