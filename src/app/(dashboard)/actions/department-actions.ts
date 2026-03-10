'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { departmentSchema, departmentUpdateSchema } from '@/lib/utils/validation';
import { createDepartment, updateDepartment } from '@/lib/services/departments';

export async function createDepartmentAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = departmentSchema.safeParse({
      name: formData.get('name'),
    });

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const department = await createDepartment(supabase, {
      name: parsed.data.name,
      createdBy: user.id,
    });

    revalidatePath('/departments');
    return { success: true, data: department };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function updateDepartmentAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    const parsed = departmentUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const department = await updateDepartment(supabase, {
      id: parsed.data.id,
      name: parsed.data.name,
      isArchived: parsed.data.isArchived,
      actorId: user.id,
    });

    revalidatePath('/departments');
    return { success: true, data: department };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
