import { describe, expect, it } from 'vitest';
import { createTask, listTasks, updateTask } from '../tasks';
import { createMockSupabase } from './mock-supabase';

describe('createTask', () => {
  it('calls create_task_with_event RPC with correct payload', async () => {
    const mock = createMockSupabase();
    const fakeTask = {
      id: 'task-1',
      project_id: 'proj-1',
      description: 'Test task',
      priority: 'medium',
      status: 'todo',
      version: 1,
    };
    mock.addResponse(fakeTask);

    const result = await createTask(mock, {
      projectId: 'proj-1',
      description: 'Test task',
      createdByType: 'human',
      createdById: 'user-1',
      source: 'ui',
    });

    expect(result).toEqual(fakeTask);
    expect(
      mock.calls.some((c) => c.method === 'rpc' && c.args[0] === 'create_task_with_event'),
    ).toBe(true);
  });

  it('throws project_not_found for RPC error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'project_not_found:Project not found' });

    await expect(
      createTask(mock, {
        projectId: 'bad-proj',
        description: 'Test',
        createdByType: 'human',
        createdById: 'user-1',
        source: 'ui',
      }),
    ).rejects.toThrow('Project not found');
  });

  it('throws project_archived for archived project', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, {
      message: 'project_archived:Cannot create tasks in an archived project',
    });

    await expect(
      createTask(mock, {
        projectId: 'archived-proj',
        description: 'Test',
        createdByType: 'human',
        createdById: 'user-1',
        source: 'ui',
      }),
    ).rejects.toThrow('archived');
  });
});

describe('updateTask', () => {
  it('calls update_task_with_events RPC with correct payload', async () => {
    const mock = createMockSupabase();
    const updatedTask = {
      id: 'task-1',
      project_id: 'proj-1',
      description: 'Updated',
      priority: 'high',
      status: 'in_progress',
      version: 2,
    };
    mock.addResponse(updatedTask);

    const result = await updateTask(mock, {
      id: 'task-1',
      version: 1,
      fields: { priority: 'high', status: 'in_progress' },
      updatedByType: 'human',
      updatedById: 'user-1',
      source: 'ui',
    });

    expect(result).toEqual(updatedTask);
    expect(
      mock.calls.some((c) => c.method === 'rpc' && c.args[0] === 'update_task_with_events'),
    ).toBe(true);
  });

  it('throws version_conflict on concurrent modification', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, {
      message: 'version_conflict:Version conflict: expected 1, current is 2',
    });

    await expect(
      updateTask(mock, {
        id: 'task-1',
        version: 1,
        fields: { status: 'done' },
        updatedByType: 'human',
        updatedById: 'user-1',
        source: 'ui',
      }),
    ).rejects.toThrow('version_conflict');
  });

  it('throws task_not_found when task does not exist', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'task_not_found:Task not found' });

    await expect(
      updateTask(mock, {
        id: 'nonexistent',
        version: 1,
        fields: { status: 'done' },
        updatedByType: 'human',
        updatedById: 'user-1',
        source: 'ui',
      }),
    ).rejects.toThrow('Task not found');
  });
});

describe('listTasks', () => {
  it('applies project and department filters', async () => {
    const mock = createMockSupabase();
    const fakeTasks = [{ id: 'task-1' }, { id: 'task-2' }];
    mock.addResponse(fakeTasks);

    const result = await listTasks(mock, {
      projectId: 'proj-1',
      departmentId: 'dept-1',
    });

    expect(result).toEqual(fakeTasks);
    expect(mock.calls.some((c) => c.method === 'eq' && c.args[0] === 'project_id')).toBe(true);
    expect(mock.calls.some((c) => c.method === 'eq' && c.args[0] === 'department_id')).toBe(true);
  });

  it('uses default sort when no sortBy specified', async () => {
    const mock = createMockSupabase();
    mock.addResponse([]);

    await listTasks(mock);

    expect(mock.calls.some((c) => c.method === 'order' && c.args[0] === 'created_at')).toBe(true);
  });
});
