import { describe, expect, it, vi } from 'vitest';
import {
  createAgentKey,
  getAgentKeyPermissions,
  hashSecret,
  listAgentKeys,
  rotateAgentKey,
  updateAgentKey,
  updateAgentKeyPermissions,
} from '../agent-keys';
import { createMockSupabase } from './mock-supabase';

// Shared test vector — must match Edge Function's hashSecret output
// echo -n "test-secret-for-parity-check" | sha256sum
const PARITY_INPUT = 'test-secret-for-parity-check';
const PARITY_EXPECTED = 'b7371a1a49db6eabfe56f6ab89b4df795ddb39d559a28653d0cdd1421ce73311';

describe('hashSecret parity', () => {
  it('produces the expected SHA-256 hex digest (matches Edge Function implementation)', async () => {
    const result = await hashSecret(PARITY_INPUT);
    expect(result).toBe(PARITY_EXPECTED);
  });
});

describe('listAgentKeys', () => {
  it('returns keys sorted by created_at desc', async () => {
    const mock = createMockSupabase();
    const fakeKeys = [
      { id: 'k2', name: 'Key 2', created_at: '2026-01-02' },
      { id: 'k1', name: 'Key 1', created_at: '2026-01-01' },
    ];
    mock.addResponse(fakeKeys);

    const result = await listAgentKeys(mock);

    expect(result).toEqual(fakeKeys);
    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'agent_keys')).toBe(true);
    expect(
      mock.calls.some(
        (c) =>
          c.method === 'order' &&
          c.args[0] === 'created_at' &&
          !(c.args[1] as { ascending: boolean }).ascending,
      ),
    ).toBe(true);
  });

  it('throws on query error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'connection error' });

    await expect(listAgentKeys(mock)).rejects.toThrow();
  });
});

describe('createAgentKey', () => {
  it('inserts with correct fields, logs event, and returns key + fullKey', async () => {
    const mock = createMockSupabase();
    const fakeKey = {
      id: 'key-id',
      name: 'Test Key',
      role: 'worker',
      key_prefix: 'abcd1234',
      is_active: true,
      special_prompt: null,
      created_at: '2026-01-01',
      last_used_at: null,
      created_by: 'user-1',
    };
    mock.addResponse(fakeKey);
    mock.addResponse(null);

    const result = await createAgentKey(mock, {
      name: 'Test Key',
      createdBy: 'user-1',
      workspaceId: 'ws-test-1',
    });

    expect(result.key).toEqual(fakeKey);
    expect(result.fullKey).toMatch(/^wb_/);
    expect(mock.calls.some((c) => c.method === 'insert')).toBe(true);
    expect(mock.calls.some((c) => c.method === 'single')).toBe(true);
    const insertCall = mock.calls.find((c) => c.method === 'insert');
    const inserted = insertCall?.args[0] as Record<string, unknown>;
    expect(inserted.name).toBe('Test Key');
    expect(inserted.role).toBe('worker');
    expect(inserted.created_by).toBe('user-1');
  });

  it('throws on insert error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'duplicate key' });

    await expect(
      createAgentKey(mock, {
        name: 'Test Key',
        createdBy: 'user-1',
        workspaceId: 'ws-test-1',
      }),
    ).rejects.toThrow();
  });
});

describe('updateAgentKey', () => {
  it('applies partial update with only provided fields and logs event', async () => {
    const mock = createMockSupabase();
    const updated = {
      id: 'k1',
      name: 'Updated',
      role: 'worker',
      key_prefix: 'abcd1234',
      is_active: true,
      special_prompt: null,
      created_at: '2026-01-01',
      last_used_at: null,
      created_by: 'user-1',
    };
    mock.addResponse(updated);
    mock.addResponse(null);

    const result = await updateAgentKey(mock, {
      id: 'k1',
      name: 'Updated',
      actorId: 'user-1',
      workspaceId: 'ws-test-1',
    });

    expect(result).toEqual(updated);
    const updateCall = mock.calls.find((c) => c.method === 'update');
    const payload = updateCall?.args[0] as Record<string, unknown>;
    expect(payload.name).toBe('Updated');
    expect(payload).not.toHaveProperty('is_active');
    expect(payload).not.toHaveProperty('special_prompt');
  });

  it('throws on update error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'not found' });

    await expect(
      updateAgentKey(mock, {
        id: 'k1',
        name: 'Updated',
        actorId: 'user-1',
        workspaceId: 'ws-test-1',
      }),
    ).rejects.toThrow();
  });
});

describe('rotateAgentKey', () => {
  it('generates new hash/prefix and logs rotation event', async () => {
    const mock = createMockSupabase();
    const rotated = {
      id: 'k1',
      name: 'Key 1',
      role: 'worker',
      key_prefix: 'newprefix',
      is_active: true,
      special_prompt: null,
      created_at: '2026-01-01',
      last_used_at: null,
      created_by: 'user-1',
    };
    mock.addResponse(rotated);
    mock.addResponse(null);

    const result = await rotateAgentKey(mock, {
      id: 'k1',
      actorId: 'user-1',
      workspaceId: 'ws-test-1',
    });

    expect(result.key).toEqual(rotated);
    expect(result.fullKey).toMatch(/^wb_k1_/);
    const updateCall = mock.calls.find((c) => c.method === 'update');
    const payload = updateCall?.args[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('key_hash');
    expect(payload).toHaveProperty('key_prefix');
  });

  it('throws on update error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'not found' });

    await expect(
      rotateAgentKey(mock, { id: 'k1', actorId: 'user-1', workspaceId: 'ws-test-1' }),
    ).rejects.toThrow();
  });
});

describe('getAgentKeyPermissions', () => {
  it('returns permissions with joins', async () => {
    const mock = createMockSupabase();
    const fakePerms = [
      {
        id: 'perm-1',
        agent_key_id: 'k1',
        project_id: 'p1',
        department_id: null,
        can_read: true,
        can_create: false,
        can_update: false,
        projects: { name: 'Project 1' },
        departments: null,
      },
    ];
    mock.addResponse(fakePerms);

    const result = await getAgentKeyPermissions(mock, 'k1');

    expect(result).toEqual(fakePerms);
    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'agent_permissions')).toBe(
      true,
    );
    expect(
      mock.calls.some(
        (c) => c.method === 'select' && (c.args[0] as string).includes('projects(name)'),
      ),
    ).toBe(true);
    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'agent_key_id' && c.args[1] === 'k1',
      ),
    ).toBe(true);
  });

  it('throws on query error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'connection error' });

    await expect(getAgentKeyPermissions(mock, 'k1')).rejects.toThrow();
  });
});

describe('updateAgentKeyPermissions', () => {
  it('calls update_agent_permissions RPC and logs event', async () => {
    const mock = createMockSupabase();
    mock.addResponse({ is_active: true }); // is_active check
    mock.addResponse(null);
    mock.addResponse(null);

    await updateAgentKeyPermissions(mock, {
      keyId: 'k1',
      permissions: [
        { projectId: 'p1', canRead: true, canCreate: false, canUpdate: false, canAssign: false },
      ],
      actorId: 'user-1',
      workspaceId: 'ws-test-1',
    });

    expect(
      mock.calls.some((c) => c.method === 'rpc' && c.args[0] === 'update_agent_permissions'),
    ).toBe(true);
    const rpcCall = mock.calls.find((c) => c.method === 'rpc');
    const rpcParams = rpcCall?.args[1] as Record<string, unknown>;
    expect(rpcParams.p_key_id).toBe('k1');
  });

  it('throws on RPC error', async () => {
    const mock = createMockSupabase();
    mock.addResponse({ is_active: true }); // is_active check
    mock.addResponse(null, { message: 'rpc failed' });

    await expect(
      updateAgentKeyPermissions(mock, {
        keyId: 'k1',
        permissions: [
          { projectId: 'p1', canRead: true, canCreate: false, canUpdate: false, canAssign: false },
        ],
        actorId: 'user-1',
        workspaceId: 'ws-test-1',
      }),
    ).rejects.toThrow();
  });

  it('throws when updating permissions on an inactive key', async () => {
    const mock = createMockSupabase();
    mock.addResponse({ is_active: false });

    await expect(
      updateAgentKeyPermissions(mock, {
        keyId: 'k1',
        permissions: [
          { projectId: 'p1', canRead: true, canCreate: false, canUpdate: false, canAssign: false },
        ],
        actorId: 'user-1',
        workspaceId: 'ws-test-1',
      }),
    ).rejects.toThrow('Cannot update permissions on an inactive key');
  });
});
