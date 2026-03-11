import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock Supabase client
// ---------------------------------------------------------------------------
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ limit: mockLimit, single: mockSingle }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: mockFrom,
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}));

// ---------------------------------------------------------------------------
// Mock service modules
// ---------------------------------------------------------------------------
vi.mock('@/lib/services/projects', () => ({
  listProjects: vi.fn(),
}));

vi.mock('@/lib/services/departments', () => ({
  listDepartments: vi.fn(),
}));

vi.mock('@/lib/services/tasks', () => ({
  listTasks: vi.fn(),
  getTaskHistory: vi.fn(),
}));

vi.mock('@/lib/services/event-log', () => ({
  listEvents: vi.fn(),
}));

vi.mock('@/lib/services/agent-keys', () => ({
  listAgentKeys: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function mockAuthenticated() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
}

function mockUnauthenticated() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: new Error('not authenticated'),
  });
}

// Suppress console.error noise from route catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { status: "ok", db: true } when DB is reachable', async () => {
    mockSingle.mockResolvedValue({ data: { id: 1 }, error: null });

    const { GET } = await import('../health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', db: true });
    expect(mockFrom).toHaveBeenCalledWith('app_settings');
  });

  it('returns 503 with { status: "degraded", db: false } when DB query fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const { GET } = await import('../health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'degraded', db: false });
  });

  it('returns 503 with { status: "error", db: false } when createClient throws', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('connection failed'),
    );

    const { GET } = await import('../health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'error', db: false });
  });
});

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../projects/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns projects on success', async () => {
    mockAuthenticated();

    const { listProjects } = await import('@/lib/services/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'p1', name: 'Project A' }]);

    const { GET } = await import('../projects/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'p1', name: 'Project A' }]);
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { listProjects } = await import('@/lib/services/projects');
    (listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../projects/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/departments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../departments/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns departments on success', async () => {
    mockAuthenticated();

    const { listDepartments } = await import('@/lib/services/departments');
    (listDepartments as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'd1', name: 'Engineering' },
    ]);

    const { GET } = await import('../departments/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'd1', name: 'Engineering' }]);
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { listDepartments } = await import('@/lib/services/departments');
    (listDepartments as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../departments/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../tasks/route');
    const response = await GET(createRequest('/api/tasks'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 400 for invalid status enum', async () => {
    mockAuthenticated();

    const { GET } = await import('../tasks/route');
    const response = await GET(createRequest('/api/tasks?status=invalid_status'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details).toBeDefined();
  });

  it('returns 400 for invalid priority enum', async () => {
    mockAuthenticated();

    const { GET } = await import('../tasks/route');
    const response = await GET(createRequest('/api/tasks?priority=ultra'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns tasks on success with no filters', async () => {
    mockAuthenticated();

    const { listTasks } = await import('@/lib/services/tasks');
    (listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1', title: 'Task One' }]);

    const { GET } = await import('../tasks/route');
    const response = await GET(createRequest('/api/tasks'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 't1', title: 'Task One' }]);
  });

  it('passes filters through to listTasks', async () => {
    mockAuthenticated();

    const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const { GET } = await import('../tasks/route');
    // Import from same module graph so we get the same mock fn the route uses
    const { listTasks } = await import('@/lib/services/tasks');
    (listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await GET(
      createRequest(`/api/tasks?projectId=${projectId}&status=todo&priority=high`),
    );

    // Ensure the request succeeded (not a validation or auth error)
    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        projectId,
        status: 'todo',
        priority: 'high',
      }),
    );
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { listTasks } = await import('@/lib/services/tasks');
    (listTasks as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../tasks/route');
    const response = await GET(createRequest('/api/tasks'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/tasks/[id]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../tasks/[id]/history/route');
    const response = await GET(createRequest('/api/tasks/task-1/history'), {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns event history on success', async () => {
    mockAuthenticated();

    const { getTaskHistory } = await import('@/lib/services/tasks');
    (getTaskHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'e1', event_type: 'task.created', target_id: 'task-1' },
    ]);

    const { GET } = await import('../tasks/[id]/history/route');
    const response = await GET(createRequest('/api/tasks/task-1/history'), {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'e1', event_type: 'task.created', target_id: 'task-1' }]);
    expect(getTaskHistory).toHaveBeenCalledWith(mockSupabase, 'task-1');
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { getTaskHistory } = await import('@/lib/services/tasks');
    (getTaskHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../tasks/[id]/history/route');
    const response = await GET(createRequest('/api/tasks/task-1/history'), {
      params: Promise.resolve({ id: 'task-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/event-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../event-log/route');
    const response = await GET(createRequest('/api/event-log'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 400 for invalid targetType', async () => {
    mockAuthenticated();

    const { GET } = await import('../event-log/route');
    const response = await GET(createRequest('/api/event-log?targetType=invalid_type'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 400 for invalid eventCategory', async () => {
    mockAuthenticated();

    const { GET } = await import('../event-log/route');
    const response = await GET(createRequest('/api/event-log?eventCategory=unknown'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns events on success', async () => {
    mockAuthenticated();

    const { listEvents } = await import('@/lib/services/event-log');
    (listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ev1', event_type: 'task.created' },
    ]);

    const { GET } = await import('../event-log/route');
    const response = await GET(createRequest('/api/event-log'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'ev1', event_type: 'task.created' }]);
  });

  it('passes filters through to listEvents', async () => {
    mockAuthenticated();

    const { listEvents } = await import('@/lib/services/event-log');
    (listEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { GET } = await import('../event-log/route');
    await GET(createRequest('/api/event-log?targetType=task&eventCategory=admin'));

    expect(listEvents).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        targetType: 'task',
        eventCategory: 'admin',
      }),
    );
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { listEvents } = await import('@/lib/services/event-log');
    (listEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../event-log/route');
    const response = await GET(createRequest('/api/event-log'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/agent-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../agent-keys/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns agent keys on success', async () => {
    mockAuthenticated();

    const { listAgentKeys } = await import('@/lib/services/agent-keys');
    (listAgentKeys as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ak1', name: 'Test Key', key_id: 'kid1' },
    ]);

    const { GET } = await import('../agent-keys/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ id: 'ak1', name: 'Test Key', key_id: 'kid1' }]);
  });

  it('returns 500 on service failure', async () => {
    mockAuthenticated();

    const { listAgentKeys } = await import('@/lib/services/agent-keys');
    (listAgentKeys as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

    const { GET } = await import('../agent-keys/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});

describe('GET /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();

    const { GET } = await import('../settings/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns settings on success', async () => {
    mockAuthenticated();
    mockSingle.mockResolvedValue({
      data: { department_required: false },
      error: null,
    });

    const { GET } = await import('../settings/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ department_required: false });
  });

  it('returns 500 when DB query fails', async () => {
    mockAuthenticated();
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'relation not found' },
    });

    const { GET } = await import('../settings/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
  });
});
