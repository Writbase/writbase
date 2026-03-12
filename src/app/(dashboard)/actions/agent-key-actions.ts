'use server';

import { revalidatePath } from 'next/cache';
import {
  createAgentKey,
  rotateAgentKey,
  updateAgentKey,
  updateAgentKeyPermissions,
} from '@/lib/services/agent-keys';
import { createClient } from '@/lib/supabase/server';
import {
  agentKeySchema,
  agentKeyUpdateSchema,
  permissionsUpdateSchema,
} from '@/lib/utils/validation';

export async function createAgentKeyAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const parsed = agentKeySchema.safeParse({
      name: formData.get('name'),
      role: formData.get('role') ?? undefined,
      specialPrompt: formData.get('specialPrompt') ?? undefined,
    });

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await createAgentKey(supabase, {
      name: parsed.data.name,
      role: parsed.data.role,
      specialPrompt: parsed.data.specialPrompt,
      createdBy: user.id,
    });

    revalidatePath('/agent-keys');
    return { success: true, data: { key: result.key, fullKey: result.fullKey } };
  } catch (err) {
    console.error('agent-key action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function updateAgentKeyAction(formData: FormData) {
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
    const specialPrompt = formData.get('specialPrompt');
    if (specialPrompt !== null) raw.specialPrompt = specialPrompt;
    const isActive = formData.get('isActive');
    if (isActive !== null) raw.isActive = isActive === 'true';

    const parsed = agentKeyUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const key = await updateAgentKey(supabase, {
      id: parsed.data.id,
      name: parsed.data.name,
      specialPrompt: parsed.data.specialPrompt,
      isActive: parsed.data.isActive,
      actorId: user.id,
    });

    revalidatePath('/agent-keys');
    return { success: true, data: key };
  } catch (err) {
    console.error('agent-key action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function rotateAgentKeyAction(keyId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await rotateAgentKey(supabase, {
      id: keyId,
      actorId: user.id,
    });

    revalidatePath('/agent-keys');
    return { success: true, data: { key: result.key, fullKey: result.fullKey } };
  } catch (err) {
    console.error('agent-key action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function updateAgentKeyPermissionsAction(data: {
  keyId: string;
  permissions: Array<{
    projectId: string;
    departmentId?: string | null;
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canAssign: boolean;
  }>;
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

    const parsed = permissionsUpdateSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await updateAgentKeyPermissions(supabase, {
      keyId: parsed.data.keyId,
      permissions: parsed.data.permissions,
      actorId: user.id,
    });

    revalidatePath('/agent-keys');
    return { success: true };
  } catch (err) {
    console.error('agent-key action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
