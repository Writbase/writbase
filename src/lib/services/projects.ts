import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@/lib/types/database';
import { generateSlug } from '@/lib/utils/slug';
import { logEvent } from './event-log';

export async function listProjects(supabase: SupabaseClient): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Project[];
}

async function generateUniqueSlug(supabase: SupabaseClient, name: string): Promise<string> {
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let suffix = 1;

  for (;;) {
    const { data } = await supabase.from('projects').select('id').eq('slug', slug).limit(1);
    const rows = data as { id: string }[] | null;

    if (!rows || rows.length === 0) return slug;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function createProject(
  supabase: SupabaseClient,
  params: { name: string; createdBy: string },
): Promise<Project> {
  const slug = await generateUniqueSlug(supabase, params.name);

  const result = await supabase
    .from('projects')
    .insert({
      name: params.name,
      slug,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (result.error) throw result.error;
  const project = result.data as Project;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'project',
    targetId: project.id,
    eventType: 'project.created',
    actorType: 'human',
    actorId: params.createdBy,
    actorLabel: 'admin',
    source: 'ui',
  });

  return project;
}

export async function updateProject(
  supabase: SupabaseClient,
  params: { id: string; name?: string; isArchived?: boolean; actorId: string },
): Promise<Project> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.isArchived !== undefined) updates.is_archived = params.isArchived;

  const fetchResult = await supabase.from('projects').select('*').eq('id', params.id).single();

  if (fetchResult.error) throw fetchResult.error;
  const existing = fetchResult.data as Project;

  const updateResult = await supabase
    .from('projects')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (updateResult.error) throw updateResult.error;
  const updated = updateResult.data as Project;

  if (params.name !== undefined && params.name !== existing.name) {
    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'project',
      targetId: params.id,
      eventType: 'project.updated',
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
      targetType: 'project',
      targetId: params.id,
      eventType: params.isArchived ? 'project.archived' : 'project.unarchived',
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
