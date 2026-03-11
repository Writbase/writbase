import { describe, expect, it } from 'vitest';
import { createProject, listProjects, updateProject } from '../projects';
import { createMockSupabase } from './mock-supabase';

describe('listProjects', () => {
  it('returns projects sorted by name', async () => {
    const mock = createMockSupabase();
    const fakeProjects = [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ];
    mock.addResponse(fakeProjects);

    const result = await listProjects(mock);

    expect(result).toEqual(fakeProjects);
    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'projects')).toBe(true);
    expect(mock.calls.some((c) => c.method === 'order' && c.args[0] === 'name')).toBe(true);
  });

  it('throws on query error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'connection error' });

    await expect(listProjects(mock)).rejects.toThrow();
  });
});

describe('createProject', () => {
  it('generates slug and inserts project', async () => {
    const mock = createMockSupabase();
    // First call: insertWithUniqueSlug (direct INSERT, no SELECT check)
    mock.addResponse({ id: 'p1', name: 'My Project', slug: 'my-project' });
    // Second call: logEvent
    mock.addResponse(null);

    const result = await createProject(mock, { name: 'My Project', createdBy: 'user-1' });

    expect(result.name).toBe('My Project');
    expect(mock.calls.some((c) => c.method === 'insert')).toBe(true);
  });
});

describe('updateProject', () => {
  it('fetches existing project, applies updates, and logs changes', async () => {
    const mock = createMockSupabase();
    // Fetch existing
    mock.addResponse({ id: 'p1', name: 'Old Name', is_archived: false });
    // Update
    mock.addResponse({ id: 'p1', name: 'New Name', is_archived: false });
    // logEvent
    mock.addResponse(null);

    const result = await updateProject(mock, {
      id: 'p1',
      name: 'New Name',
      actorId: 'user-1',
    });

    expect(result.name).toBe('New Name');
  });
});
