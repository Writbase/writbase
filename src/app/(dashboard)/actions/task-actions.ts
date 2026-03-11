'use server';

import { revalidatePath } from 'next/cache';
import { createTask, updateTask } from '@/lib/services/tasks';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/utils/errors';
import { taskCreateSchema, taskUpdateSchema } from '@/lib/utils/validation';

export async function createTaskAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = taskCreateSchema.safeParse({
      projectId: formData.get('projectId'),
      departmentId: formData.get('departmentId') ?? undefined,
      priority: formData.get('priority') ?? undefined,
      description: formData.get('description'),
      notes: formData.get('notes') ?? undefined,
      dueDate: formData.get('dueDate') ?? undefined,
      status: formData.get('status') ?? undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      };
    }

    const task = await createTask(supabase, {
      projectId: parsed.data.projectId,
      departmentId: parsed.data.departmentId,
      priority: parsed.data.priority,
      description: parsed.data.description,
      notes: parsed.data.notes,
      dueDate: parsed.data.dueDate,
      status: parsed.data.status,
      createdByType: 'human',
      createdById: user.id,
      source: 'ui',
    });

    revalidatePath('/tasks');
    return { success: true, data: task };
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err.message, code: err.code };
    }
    console.error('createTaskAction error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function updateTaskAction(data: {
  id: string;
  version: number;
  projectId?: string;
  departmentId?: string | null;
  priority?: string;
  description?: string;
  notes?: string | null;
  dueDate?: string | null;
  status?: string;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = taskUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      };
    }

    const { id, version, ...fields } = parsed.data;
    const task = await updateTask(supabase, {
      id,
      version,
      fields,
      updatedByType: 'human',
      updatedById: user.id,
      source: 'ui',
    });

    revalidatePath('/tasks');
    return { success: true, data: task };
  } catch (err) {
    if (err instanceof AppError && err.code === 'version_conflict') {
      return { success: false, error: err.message, code: 'version_conflict' };
    }
    if (err instanceof AppError) {
      return { success: false, error: err.message, code: err.code };
    }
    console.error('updateTaskAction error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
