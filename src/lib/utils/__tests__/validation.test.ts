import { describe, expect, it } from 'vitest';
import {
  agentKeySchema,
  agentKeyUpdateSchema,
  departmentSchema,
  departmentUpdateSchema,
  permissionSchema,
  permissionsUpdateSchema,
  projectSchema,
  projectUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from '@/lib/utils/validation';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440000';

describe('projectSchema', () => {
  it('accepts a valid name', () => {
    expect(projectSchema.parse({ name: 'My Project' })).toEqual({ name: 'My Project' });
  });

  it('rejects empty name', () => {
    expect(() => projectSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name over 100 characters', () => {
    expect(() => projectSchema.parse({ name: 'a'.repeat(101) })).toThrow();
  });

  it('accepts name at exactly 100 characters', () => {
    expect(projectSchema.parse({ name: 'a'.repeat(100) })).toBeTruthy();
  });
});

describe('projectUpdateSchema', () => {
  it('accepts valid update with name', () => {
    const result = projectUpdateSchema.parse({ id: VALID_UUID, name: 'New Name' });
    expect(result.name).toBe('New Name');
  });

  it('accepts update with isArchived', () => {
    const result = projectUpdateSchema.parse({ id: VALID_UUID, isArchived: true });
    expect(result.isArchived).toBe(true);
  });

  it('rejects invalid uuid', () => {
    expect(() => projectUpdateSchema.parse({ id: 'not-a-uuid', name: 'x' })).toThrow();
  });
});

describe('departmentSchema', () => {
  it('accepts a valid name', () => {
    expect(departmentSchema.parse({ name: 'Engineering' })).toEqual({ name: 'Engineering' });
  });

  it('rejects empty name', () => {
    expect(() => departmentSchema.parse({ name: '' })).toThrow();
  });

  it('rejects name over 100 characters', () => {
    expect(() => departmentSchema.parse({ name: 'a'.repeat(101) })).toThrow();
  });
});

describe('departmentUpdateSchema', () => {
  it('accepts valid update', () => {
    const result = departmentUpdateSchema.parse({ id: VALID_UUID, name: 'New Dept' });
    expect(result.name).toBe('New Dept');
  });

  it('rejects invalid uuid', () => {
    expect(() => departmentUpdateSchema.parse({ id: 'bad', name: 'x' })).toThrow();
  });
});

describe('taskCreateSchema', () => {
  const validTask = {
    projectId: VALID_UUID,
    description: 'Fix the login bug',
  };

  it('accepts valid task with defaults', () => {
    const result = taskCreateSchema.parse(validTask);
    expect(result.priority).toBe('medium');
    expect(result.status).toBe('todo');
  });

  it('accepts valid task with all fields', () => {
    const result = taskCreateSchema.parse({
      ...validTask,
      departmentId: VALID_UUID_2,
      priority: 'critical',
      notes: 'Some notes',
      dueDate: '2026-12-31T00:00:00.000Z',
      status: 'in_progress',
    });
    expect(result.priority).toBe('critical');
    expect(result.status).toBe('in_progress');
  });

  it('rejects description under 3 characters', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, description: 'ab' })).toThrow();
  });

  it('rejects description over 5000 characters', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, description: 'a'.repeat(5001) })).toThrow();
  });

  it('rejects invalid priority', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, priority: 'urgent' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, status: 'pending' })).toThrow();
  });

  it('rejects invalid projectId', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, projectId: 'not-uuid' })).toThrow();
  });

  it('allows null departmentId', () => {
    const result = taskCreateSchema.parse({ ...validTask, departmentId: null });
    expect(result.departmentId).toBeNull();
  });

  it('rejects notes over 10000 characters', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, notes: 'a'.repeat(10001) })).toThrow();
  });

  it('rejects invalid datetime for dueDate', () => {
    expect(() => taskCreateSchema.parse({ ...validTask, dueDate: 'not-a-date' })).toThrow();
  });
});

describe('taskUpdateSchema', () => {
  const validUpdate = {
    id: VALID_UUID,
    version: 1,
    description: 'Updated description',
  };

  it('accepts valid update', () => {
    const result = taskUpdateSchema.parse(validUpdate);
    expect(result.description).toBe('Updated description');
  });

  it('rejects update with no fields to change (only id and version)', () => {
    expect(() => taskUpdateSchema.parse({ id: VALID_UUID, version: 1 })).toThrow(
      'At least one field to update is required',
    );
  });

  it('rejects version less than 1', () => {
    expect(() => taskUpdateSchema.parse({ ...validUpdate, version: 0 })).toThrow();
  });

  it('rejects non-integer version', () => {
    expect(() => taskUpdateSchema.parse({ ...validUpdate, version: 1.5 })).toThrow();
  });

  it('allows nullable departmentId', () => {
    const result = taskUpdateSchema.parse({ ...validUpdate, departmentId: null });
    expect(result.departmentId).toBeNull();
  });
});

describe('agentKeySchema', () => {
  it('accepts valid agent key with defaults', () => {
    const result = agentKeySchema.parse({ name: 'My Agent' });
    expect(result.role).toBe('worker');
  });

  it('accepts manager role', () => {
    const result = agentKeySchema.parse({ name: 'Manager Agent', role: 'manager' });
    expect(result.role).toBe('manager');
  });

  it('rejects empty name', () => {
    expect(() => agentKeySchema.parse({ name: '' })).toThrow();
  });

  it('rejects name over 100 characters', () => {
    expect(() => agentKeySchema.parse({ name: 'a'.repeat(101) })).toThrow();
  });

  it('rejects invalid role', () => {
    expect(() => agentKeySchema.parse({ name: 'Agent', role: 'admin' })).toThrow();
  });

  it('rejects specialPrompt over 5000 characters', () => {
    expect(() =>
      agentKeySchema.parse({ name: 'Agent', specialPrompt: 'a'.repeat(5001) }),
    ).toThrow();
  });
});

describe('agentKeyUpdateSchema', () => {
  it('accepts valid update', () => {
    const result = agentKeyUpdateSchema.parse({ id: VALID_UUID, name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('accepts isActive toggle', () => {
    const result = agentKeyUpdateSchema.parse({ id: VALID_UUID, isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('rejects invalid uuid', () => {
    expect(() => agentKeyUpdateSchema.parse({ id: 'bad', name: 'x' })).toThrow();
  });
});

describe('permissionSchema', () => {
  it('accepts valid permission with defaults', () => {
    const result = permissionSchema.parse({
      agentKeyId: VALID_UUID,
      projectId: VALID_UUID_2,
    });
    expect(result.canRead).toBe(true);
    expect(result.canCreate).toBe(false);
    expect(result.canUpdate).toBe(false);
  });

  it('accepts full permission set', () => {
    const result = permissionSchema.parse({
      agentKeyId: VALID_UUID,
      projectId: VALID_UUID_2,
      departmentId: VALID_UUID,
      canRead: true,
      canCreate: true,
      canUpdate: true,
    });
    expect(result.canCreate).toBe(true);
  });

  it('allows null departmentId', () => {
    const result = permissionSchema.parse({
      agentKeyId: VALID_UUID,
      projectId: VALID_UUID_2,
      departmentId: null,
    });
    expect(result.departmentId).toBeNull();
  });
});

describe('permissionsUpdateSchema', () => {
  it('accepts valid permissions update', () => {
    const result = permissionsUpdateSchema.parse({
      keyId: VALID_UUID,
      permissions: [{ projectId: VALID_UUID_2, canRead: true, canCreate: false, canUpdate: false }],
    });
    expect(result.permissions).toHaveLength(1);
  });

  it('accepts empty permissions array', () => {
    const result = permissionsUpdateSchema.parse({
      keyId: VALID_UUID,
      permissions: [],
    });
    expect(result.permissions).toHaveLength(0);
  });

  it('rejects invalid keyId', () => {
    expect(() => permissionsUpdateSchema.parse({ keyId: 'bad', permissions: [] })).toThrow();
  });

  it('rejects permission with invalid projectId', () => {
    expect(() =>
      permissionsUpdateSchema.parse({
        keyId: VALID_UUID,
        permissions: [{ projectId: 'bad' }],
      }),
    ).toThrow();
  });
});
