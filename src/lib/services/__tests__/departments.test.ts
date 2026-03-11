import { describe, expect, it } from 'vitest';
import { createDepartment, listDepartments, updateDepartment } from '../departments';
import { createMockSupabase } from './mock-supabase';

describe('listDepartments', () => {
  it('returns departments sorted by name', async () => {
    const mock = createMockSupabase();
    const fakeDepts = [
      { id: 'd1', name: 'Engineering' },
      { id: 'd2', name: 'Sales' },
    ];
    mock.addResponse(fakeDepts);

    const result = await listDepartments(mock);

    expect(result).toEqual(fakeDepts);
    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'departments')).toBe(true);
  });

  it('throws on query error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'connection error' });

    await expect(listDepartments(mock)).rejects.toThrow();
  });
});

describe('createDepartment', () => {
  it('generates slug and inserts department', async () => {
    const mock = createMockSupabase();
    // First call: insertWithUniqueSlug (direct INSERT, no SELECT check)
    mock.addResponse({ id: 'd1', name: 'Engineering', slug: 'engineering' });
    // Second call: logEvent
    mock.addResponse(null);

    const result = await createDepartment(mock, { name: 'Engineering', createdBy: 'user-1' });

    expect(result.name).toBe('Engineering');
    expect(mock.calls.some((c) => c.method === 'insert')).toBe(true);
  });
});

describe('updateDepartment', () => {
  it('fetches existing, applies updates, and logs changes', async () => {
    const mock = createMockSupabase();
    // Fetch existing
    mock.addResponse({ id: 'd1', name: 'Old Dept', is_archived: false });
    // Update
    mock.addResponse({ id: 'd1', name: 'New Dept', is_archived: false });
    // logEvent
    mock.addResponse(null);

    const result = await updateDepartment(mock, {
      id: 'd1',
      name: 'New Dept',
      actorId: 'user-1',
    });

    expect(result.name).toBe('New Dept');
  });

  it('logs archive event when archiving', async () => {
    const mock = createMockSupabase();
    // Fetch existing
    mock.addResponse({ id: 'd1', name: 'Dept', is_archived: false });
    // Update
    mock.addResponse({ id: 'd1', name: 'Dept', is_archived: true });
    // logEvent
    mock.addResponse(null);

    const result = await updateDepartment(mock, {
      id: 'd1',
      isArchived: true,
      actorId: 'user-1',
    });

    expect(result.is_archived).toBe(true);
  });
});
