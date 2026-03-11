import { describe, expect, it, vi } from 'vitest';
import { listEvents, logEvent } from '../event-log';
import { createMockSupabase } from './mock-supabase';

describe('logEvent', () => {
  it('inserts correct fields', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null);

    await logEvent(mock, {
      eventCategory: 'task',
      targetType: 'task',
      targetId: 'task-1',
      eventType: 'task.created',
      actorType: 'human',
      actorId: 'user-1',
      actorLabel: 'admin',
      source: 'ui',
    });

    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'event_log')).toBe(true);
    const insertCall = mock.calls.find((c) => c.method === 'insert');
    const inserted = insertCall?.args[0] as Record<string, unknown>;
    expect(inserted.event_category).toBe('task');
    expect(inserted.target_type).toBe('task');
    expect(inserted.target_id).toBe('task-1');
    expect(inserted.event_type).toBe('task.created');
    expect(inserted.actor_type).toBe('human');
    expect(inserted.actor_id).toBe('user-1');
    expect(inserted.actor_label).toBe('admin');
    expect(inserted.source).toBe('ui');
    expect(inserted.field_name).toBeNull();
    expect(inserted.old_value).toBeNull();
    expect(inserted.new_value).toBeNull();
  });

  it('logs error to console but does not throw for non-critical failure', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'insert failed' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await logEvent(mock, {
      eventCategory: 'task',
      targetType: 'task',
      targetId: 'task-1',
      eventType: 'task.created',
      actorType: 'human',
      actorId: 'user-1',
      actorLabel: 'admin',
      source: 'ui',
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('throws on insert error when eventCategory is admin', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'insert failed' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logEvent(mock, {
        eventCategory: 'admin',
        targetType: 'agent_key',
        targetId: 'k1',
        eventType: 'agent_key.created',
        actorType: 'human',
        actorId: 'user-1',
        actorLabel: 'admin',
        source: 'ui',
      }),
    ).rejects.toThrow('Critical audit log failure');

    consoleSpy.mockRestore();
  });

  it('throws when opts.critical is true even for non-admin category', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'insert failed' });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logEvent(
        mock,
        {
          eventCategory: 'task',
          targetType: 'task',
          targetId: 'task-1',
          eventType: 'task.created',
          actorType: 'human',
          actorId: 'user-1',
          actorLabel: 'admin',
          source: 'ui',
        },
        { critical: true },
      ),
    ).rejects.toThrow('Critical audit log failure');

    consoleSpy.mockRestore();
  });
});

describe('listEvents', () => {
  it('returns all events with default limit 50', async () => {
    const mock = createMockSupabase();
    const fakeEvents = [{ id: 'e1' }, { id: 'e2' }];
    mock.addResponse(fakeEvents);

    const result = await listEvents(mock);

    expect(result).toEqual(fakeEvents);
    expect(mock.calls.some((c) => c.method === 'from' && c.args[0] === 'event_log')).toBe(true);
    expect(
      mock.calls.some(
        (c) =>
          c.method === 'order' &&
          c.args[0] === 'created_at' &&
          !(c.args[1] as { ascending: boolean }).ascending,
      ),
    ).toBe(true);
    expect(
      mock.calls.some((c) => c.method === 'range' && c.args[0] === 0 && c.args[1] === 49),
    ).toBe(true);
  });

  it('applies targetId filter', async () => {
    const mock = createMockSupabase();
    mock.addResponse([]);

    await listEvents(mock, { targetId: 'task-1' });

    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'target_id' && c.args[1] === 'task-1',
      ),
    ).toBe(true);
  });

  it('applies targetType filter', async () => {
    const mock = createMockSupabase();
    mock.addResponse([]);

    await listEvents(mock, { targetType: 'task' });

    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'target_type' && c.args[1] === 'task',
      ),
    ).toBe(true);
  });

  it('applies eventCategory filter', async () => {
    const mock = createMockSupabase();
    mock.addResponse([]);

    await listEvents(mock, { eventCategory: 'admin' });

    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'event_category' && c.args[1] === 'admin',
      ),
    ).toBe(true);
  });

  it('applies all filters combined', async () => {
    const mock = createMockSupabase();
    mock.addResponse([]);

    await listEvents(mock, {
      targetId: 'task-1',
      targetType: 'task',
      eventCategory: 'task',
      limit: 10,
      offset: 5,
    });

    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'target_id' && c.args[1] === 'task-1',
      ),
    ).toBe(true);
    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'target_type' && c.args[1] === 'task',
      ),
    ).toBe(true);
    expect(
      mock.calls.some(
        (c) => c.method === 'eq' && c.args[0] === 'event_category' && c.args[1] === 'task',
      ),
    ).toBe(true);
    expect(
      mock.calls.some((c) => c.method === 'range' && c.args[0] === 5 && c.args[1] === 14),
    ).toBe(true);
  });

  it('throws on query error', async () => {
    const mock = createMockSupabase();
    mock.addResponse(null, { message: 'connection error' });

    await expect(listEvents(mock)).rejects.toThrow();
  });
});
