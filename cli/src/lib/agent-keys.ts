import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole } from './types.js';
import { logEvent } from './event-log.js';

async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateKey(
  keyId: string,
): Promise<{ fullKey: string; prefix: string; hash: string }> {
  const randomBytes = new Uint8Array(32);
  webcrypto.getRandomValues(randomBytes);
  const secret = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashSecret(secret);
  const prefix = secret.slice(0, 8);
  const fullKey = `wb_${keyId}_${secret}`;
  return { fullKey, prefix, hash };
}

const KEY_COLUMNS =
  'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by, project_id, department_id';

export async function listAgentKeys(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase
    .from('agent_keys')
    .select(KEY_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createAgentKey(
  supabase: SupabaseClient,
  params: {
    name: string;
    role?: AgentRole;
    workspaceId: string;
    projectId?: string | null;
    departmentId?: string | null;
  },
) {
  const keyId = webcrypto.randomUUID();
  const { fullKey, prefix, hash } = await generateKey(keyId);

  const { data, error } = await supabase
    .from('agent_keys')
    .insert({
      id: keyId,
      name: params.name,
      role: params.role ?? 'worker',
      key_hash: hash,
      key_prefix: prefix,
      special_prompt: null,
      created_by: 'writbase-cli',
      workspace_id: params.workspaceId,
      project_id: params.projectId ?? null,
      department_id: params.departmentId ?? null,
    })
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: data.id,
    eventType: 'agent_key.created',
    actorType: 'system',
    actorId: 'writbase-cli',
    actorLabel: 'writbase-cli',
    source: 'system',
    workspaceId: params.workspaceId,
  });

  return { key: data, fullKey };
}

export async function rotateAgentKey(
  supabase: SupabaseClient,
  params: { id: string; workspaceId: string },
) {
  const { fullKey, prefix, hash } = await generateKey(params.id);

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ key_hash: hash, key_prefix: prefix })
    .eq('id', params.id)
    .eq('workspace_id', params.workspaceId)
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.rotated',
    actorType: 'system',
    actorId: 'writbase-cli',
    actorLabel: 'writbase-cli',
    source: 'system',
    workspaceId: params.workspaceId,
  });

  return { key: data, fullKey };
}

export async function deactivateAgentKey(
  supabase: SupabaseClient,
  params: { id: string; workspaceId: string },
) {
  const { data, error } = await supabase
    .from('agent_keys')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('workspace_id', params.workspaceId)
    .select(KEY_COLUMNS)
    .single();

  if (error) throw error;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.id,
    eventType: 'agent_key.deactivated',
    actorType: 'system',
    actorId: 'writbase-cli',
    actorLabel: 'writbase-cli',
    source: 'system',
    workspaceId: params.workspaceId,
  });

  return data;
}
