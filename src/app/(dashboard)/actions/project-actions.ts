'use server';

import { revalidatePath } from 'next/cache';
import { createProject, updateProject } from '@/lib/services/projects';
import { createClient } from '@/lib/supabase/server';
import { projectSchema, projectUpdateSchema } from '@/lib/utils/validation';

export async function createProjectAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = projectSchema.safeParse({
      name: formData.get('name'),
    });

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const project = await createProject(supabase, {
      name: parsed.data.name,
      createdBy: user.id,
    });

    revalidatePath('/', 'layout');
    return { success: true, data: project };
  } catch (err) {
    console.error('project action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function updateProjectAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const raw: Record<string, unknown> = {
      id: formData.get('id'),
    };
    const name = formData.get('name');
    if (name !== null) raw.name = name;
    const isArchived = formData.get('isArchived');
    if (isArchived !== null) raw.isArchived = isArchived === 'true';

    const parsed = projectUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const project = await updateProject(supabase, {
      id: parsed.data.id,
      name: parsed.data.name,
      isArchived: parsed.data.isArchived,
      actorId: user.id,
    });

    revalidatePath('/', 'layout');
    return { success: true, data: project };
  } catch (err) {
    console.error('project action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
