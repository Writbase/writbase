import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentKey, AgentPermission } from '@/lib/types/database';
import type { AgentRole } from '@/lib/types/enums';
import { logEvent } from './event-log';

function generateKey(keyId: string): { fullKey: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const hash = crypto.createHash('sha256').update(secret).digest('hex'); // hash SECRET only
  const prefix = secret.slice(0, 8); // first 8 chars of secret
  const fullKey = `wb_${keyId}_${secret}`;
  return { fullKey, prefix, hash };
}

export async function listAgentKeys(
  supabase: SupabaseClient,
): Promise<Omit<AgentKey, 'key_hash'>[]> {
  const { data, error } = await supabase
    .from('agent_keys')
    .select(
      'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by',
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Omit<AgentKey, 'key_hash'>[];
}

export async function createAgentKey(
  supabase: SupabaseClient,
  params: {
    name: string;
    role?: AgentRole;
    specialPrompt?: string | null;
    createdBy: string;
  },
): Promise<{ key: Omit<AgentKey, 'key_hash'>; fullKey: string }> {
  const keyId = crypto.randomUUID();
  const { fullKey, prefix, hash } = generateKey(keyId);

  const { data, error } = await supabase
    .from('agent_keys')
    .insert({
      id: keyId,
      name: params.name,
      role: params.role ?? 'worker',
      key_hash: hash,
      key_prefix: prefix,
      special_prompt: params.specialPrompt ?? null,
      created_by: params.createdBy,
    })
    .select(
      'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by',
    )
    .single();

  if (error) throw error;
  const key = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: key.id,
    eventType: 'agent_key.created',
    actorType: 'human',
    actorId: params.createdBy,
    actorLabel: 'admin',
    source: 'ui',
  });

  return { key, fullKey };
}

export async function updateAgentKey(
  supabase: SupabaseClient,
  params: {
    id: string;
    name?: string;
    specialPrompt?: string | null;
    isActive?: boolean;
    actorId: string;
  },
): Promise<Omit<AgentKey, 'key_hash'>> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.specialPrompt !== undefined) updates.special_prompt = params.specialPrompt;
  if (params.isActive !== undefined) updates.is_active = params.isActive;

  const { data, error } = await supabase
    .from('agent_keys')
    .update(updates)
    .eq('id', params.id)
    .select(
      'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by',
    )
    .single();

  if (error) throw error;
  const updated = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.updated',
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
  });

  return updated;
}

export async function rotateAgentKey(
  supabase: SupabaseClient,
  params: { id: string; actorId: string },
): Promise<{ key: Omit<AgentKey, 'key_hash'>; fullKey: string }> {
  const { fullKey, prefix, hash } = generateKey(params.id);

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ key_hash: hash, key_prefix: prefix })
    .eq('id', params.id)
    .select(
      'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by',
    )
    .single();

  if (error) throw error;
  const key = data as Omit<AgentKey, 'key_hash'>;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.rotated',
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
  });

  return { key, fullKey };
}

export async function getAgentKeyPermissions(
  supabase: SupabaseClient,
  keyId: string,
): Promise<
  (AgentPermission & { projects?: { name: string }; departments?: { name: string } | null })[]
> {
  const { data, error } = await supabase
    .from('agent_permissions')
    .select('*, projects(name), departments(name)')
    .eq('agent_key_id', keyId);

  if (error) throw error;
  type PermissionWithRelations = AgentPermission & {
    projects?: { name: string };
    departments?: { name: string } | null;
  };
  return data as PermissionWithRelations[];
}

export async function updateAgentKeyPermissions(
  supabase: SupabaseClient,
  params: {
    keyId: string;
    permissions: Array<{
      projectId: string;
      departmentId?: string | null;
      canRead: boolean;
      canCreate: boolean;
      canUpdate: boolean;
    }>;
    actorId: string;
  },
): Promise<void> {
  const rows = params.permissions.map((p) => ({
    project_id: p.projectId,
    department_id: p.departmentId ?? null,
    can_read: p.canRead,
    can_create: p.canCreate,
    can_update: p.canUpdate,
  }));

  const { error: rpcError } = await supabase.rpc('update_agent_permissions', {
    p_key_id: params.keyId,
    p_rows: rows,
  });

  if (rpcError) throw rpcError;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.keyId,
    eventType: 'agent_key.permissions_updated',
    newValue: params.permissions,
    actorType: 'human',
    actorId: params.actorId,
    actorLabel: 'admin',
    source: 'ui',
  });
}
