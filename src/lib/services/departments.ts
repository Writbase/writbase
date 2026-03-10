import type { SupabaseClient } from '@supabase/supabase-js';
import slugify from 'slugify';
import type { Department } from '@/lib/types/database';
import { logEvent } from './event-log';

export async function listDepartments(supabase: SupabaseClient): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function generateUniqueSlug(
  supabase: SupabaseClient,
  name: string,
): Promise<string> {
  const baseSlug = slugify(name, { lower: true, strict: true });
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const { data } = await supabase
      .from('departments')
      .select('id')
      .eq('slug', slug)
      .limit(1);

    if (!data || data.length === 0) return slug;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function createDepartment(
  supabase: SupabaseClient,
  params: { name: string; createdBy: string },
): Promise<Department> {
  const slug = await generateUniqueSlug(supabase, params.name);

  const { data, error } = await supabase
    .from('departments')
    .insert({
      name: params.name,
      slug,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'department',
    targetId: data.id,
    eventType: 'department.created',
    actorType: 'human',
    actorId: params.createdBy,
    actorLabel: 'admin',
    source: 'ui',
  });

  return data;
}

export async function updateDepartment(
  supabase: SupabaseClient,
  params: { id: string; name?: string; isArchived?: boolean; actorId: string },
): Promise<Department> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.isArchived !== undefined) updates.is_archived = params.isArchived;

  const { data: existing, error: fetchError } = await supabase
    .from('departments')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('departments')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

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

  return data;
}
