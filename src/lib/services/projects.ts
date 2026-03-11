import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@/lib/types/database';
import { generateSlug, insertWithUniqueSlug } from '@/lib/utils/slug';
import { logEvent } from './event-log';

export async function listProjects(supabase: SupabaseClient): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data as Project[];
}

export async function createProject(
  supabase: SupabaseClient,
  params: { name: string; createdBy: string },
): Promise<Project> {
  const baseSlug = generateSlug(params.name);

  const project = (await insertWithUniqueSlug(
    supabase,
    'projects',
    {
      name: params.name,
      created_by: params.createdBy,
    },
    baseSlug,
  )) as unknown as Project;

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
