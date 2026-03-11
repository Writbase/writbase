import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/utils/errors';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/services/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('@/lib/services/projects', () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('@/lib/services/departments', () => ({
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
}));

vi.mock('@/lib/services/agent-keys', () => ({
  createAgentKey: vi.fn(),
  updateAgentKey: vi.fn(),
  rotateAgentKey: vi.fn(),
  updateAgentKeyPermissions: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

const FAKE_USER_ID = '00000000-0000-4000-a000-000000000001';
const FAKE_PROJECT_ID = '00000000-0000-4000-a000-000000000002';
const FAKE_DEPARTMENT_ID = '00000000-0000-4000-a000-000000000003';
const FAKE_TASK_ID = '00000000-0000-4000-a000-000000000004';
const FAKE_KEY_ID = '00000000-0000-4000-a000-000000000005';

function authenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FAKE_USER_ID } },
    error: null,
  });
}

function unauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'not authenticated' },
  });
}

// ---------------------------------------------------------------------------
// Task Actions
// ---------------------------------------------------------------------------

describe('Task Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTaskAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(
        createFormData({ projectId: FAKE_PROJECT_ID, description: 'Test task' }),
      );
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error when description is missing', async () => {
      authenticatedUser();
      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(createFormData({ projectId: FAKE_PROJECT_ID }));
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns validation error when description is too short', async () => {
      authenticatedUser();
      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(
        createFormData({ projectId: FAKE_PROJECT_ID, description: 'ab' }),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    it('returns success with task data', async () => {
      authenticatedUser();
      const { createTask } = await import('@/lib/services/tasks');
      const mockTask = { id: FAKE_TASK_ID, description: 'Test task' };
      vi.mocked(createTask).mockResolvedValue(mockTask as never);

      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(
        createFormData({ projectId: FAKE_PROJECT_ID, description: 'Test task' }),
      );

      expect(result).toEqual({ success: true, data: mockTask });
      expect(createTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          projectId: FAKE_PROJECT_ID,
          description: 'Test task',
          createdByType: 'human',
          createdById: FAKE_USER_ID,
          source: 'ui',
        }),
      );

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/tasks');
    });

    it('returns AppError code and message when service throws AppError', async () => {
      authenticatedUser();
      const { createTask } = await import('@/lib/services/tasks');
      vi.mocked(createTask).mockRejectedValue(
        new AppError('project_not_found', 'Project not found', 404),
      );

      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(
        createFormData({ projectId: FAKE_PROJECT_ID, description: 'Test task' }),
      );

      expect(result).toEqual({
        success: false,
        error: 'Project not found',
        code: 'project_not_found',
      });
    });

    it('returns generic error when service throws unknown error', async () => {
      authenticatedUser();
      const { createTask } = await import('@/lib/services/tasks');
      vi.mocked(createTask).mockRejectedValue(new Error('DB connection lost'));

      const { createTaskAction } = await import('../task-actions');
      const result = await createTaskAction(
        createFormData({ projectId: FAKE_PROJECT_ID, description: 'Test task' }),
      );

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('updateTaskAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { updateTaskAction } = await import('../task-actions');
      const result = await updateTaskAction({
        id: FAKE_TASK_ID,
        version: 1,
        description: 'Updated',
      });
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error when no fields provided', async () => {
      authenticatedUser();
      const { updateTaskAction } = await import('../task-actions');
      const result = await updateTaskAction({
        id: FAKE_TASK_ID,
        version: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one field');
    });

    it('returns success with updated task data', async () => {
      authenticatedUser();
      const { updateTask } = await import('@/lib/services/tasks');
      const mockTask = { id: FAKE_TASK_ID, description: 'Updated', version: 2 };
      vi.mocked(updateTask).mockResolvedValue(mockTask as never);

      const { updateTaskAction } = await import('../task-actions');
      const result = await updateTaskAction({
        id: FAKE_TASK_ID,
        version: 1,
        description: 'Updated',
      });

      expect(result).toEqual({ success: true, data: mockTask });
      expect(updateTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_TASK_ID,
          version: 1,
          fields: expect.objectContaining({ description: 'Updated' }),
          updatedByType: 'human',
          updatedById: FAKE_USER_ID,
          source: 'ui',
        }),
      );

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/tasks');
    });

    it('returns version_conflict code on version conflict', async () => {
      authenticatedUser();
      const { updateTask } = await import('@/lib/services/tasks');
      vi.mocked(updateTask).mockRejectedValue(
        new AppError('version_conflict', 'Version conflict', 409),
      );

      const { updateTaskAction } = await import('../task-actions');
      const result = await updateTaskAction({
        id: FAKE_TASK_ID,
        version: 1,
        description: 'Updated',
      });

      expect(result).toEqual({
        success: false,
        error: 'Version conflict',
        code: 'version_conflict',
      });
    });

    it('returns generic error on unknown service error', async () => {
      authenticatedUser();
      const { updateTask } = await import('@/lib/services/tasks');
      vi.mocked(updateTask).mockRejectedValue(new Error('unexpected'));

      const { updateTaskAction } = await import('../task-actions');
      const result = await updateTaskAction({
        id: FAKE_TASK_ID,
        version: 1,
        description: 'Updated',
      });

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Project Actions
// ---------------------------------------------------------------------------

describe('Project Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProjectAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { createProjectAction } = await import('../project-actions');
      const result = await createProjectAction(createFormData({ name: 'Proj' }));
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error for empty name', async () => {
      authenticatedUser();
      const { createProjectAction } = await import('../project-actions');
      const result = await createProjectAction(createFormData({ name: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success with project data', async () => {
      authenticatedUser();
      const { createProject } = await import('@/lib/services/projects');
      const mockProject = { id: FAKE_PROJECT_ID, name: 'My Project' };
      vi.mocked(createProject).mockResolvedValue(mockProject as never);

      const { createProjectAction } = await import('../project-actions');
      const result = await createProjectAction(createFormData({ name: 'My Project' }));

      expect(result).toEqual({ success: true, data: mockProject });
      expect(createProject).toHaveBeenCalledWith(expect.anything(), {
        name: 'My Project',
        createdBy: FAKE_USER_ID,
      });

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    });

    it('returns generic error on service failure', async () => {
      authenticatedUser();
      const { createProject } = await import('@/lib/services/projects');
      vi.mocked(createProject).mockRejectedValue(new Error('boom'));

      const { createProjectAction } = await import('../project-actions');
      const result = await createProjectAction(createFormData({ name: 'My Project' }));

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('updateProjectAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { updateProjectAction } = await import('../project-actions');
      const result = await updateProjectAction(
        createFormData({ id: FAKE_PROJECT_ID, name: 'New Name' }),
      );
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success when updating name', async () => {
      authenticatedUser();
      const { updateProject } = await import('@/lib/services/projects');
      const mockProject = { id: FAKE_PROJECT_ID, name: 'Renamed' };
      vi.mocked(updateProject).mockResolvedValue(mockProject as never);

      const { updateProjectAction } = await import('../project-actions');
      const result = await updateProjectAction(
        createFormData({ id: FAKE_PROJECT_ID, name: 'Renamed' }),
      );

      expect(result).toEqual({ success: true, data: mockProject });
      expect(updateProject).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_PROJECT_ID,
          name: 'Renamed',
          actorId: FAKE_USER_ID,
        }),
      );
    });

    it('returns success when archiving', async () => {
      authenticatedUser();
      const { updateProject } = await import('@/lib/services/projects');
      const mockProject = { id: FAKE_PROJECT_ID, isArchived: true };
      vi.mocked(updateProject).mockResolvedValue(mockProject as never);

      const { updateProjectAction } = await import('../project-actions');
      const result = await updateProjectAction(
        createFormData({ id: FAKE_PROJECT_ID, isArchived: 'true' }),
      );

      expect(result).toEqual({ success: true, data: mockProject });
      expect(updateProject).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_PROJECT_ID,
          isArchived: true,
          actorId: FAKE_USER_ID,
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Department Actions
// ---------------------------------------------------------------------------

describe('Department Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDepartmentAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { createDepartmentAction } = await import('../department-actions');
      const result = await createDepartmentAction(createFormData({ name: 'Dept' }));
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error for empty name', async () => {
      authenticatedUser();
      const { createDepartmentAction } = await import('../department-actions');
      const result = await createDepartmentAction(createFormData({ name: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success with department data', async () => {
      authenticatedUser();
      const { createDepartment } = await import('@/lib/services/departments');
      const mockDept = { id: FAKE_DEPARTMENT_ID, name: 'Engineering' };
      vi.mocked(createDepartment).mockResolvedValue(mockDept as never);

      const { createDepartmentAction } = await import('../department-actions');
      const result = await createDepartmentAction(createFormData({ name: 'Engineering' }));

      expect(result).toEqual({ success: true, data: mockDept });
      expect(createDepartment).toHaveBeenCalledWith(expect.anything(), {
        name: 'Engineering',
        createdBy: FAKE_USER_ID,
      });

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    });

    it('returns generic error on service failure', async () => {
      authenticatedUser();
      const { createDepartment } = await import('@/lib/services/departments');
      vi.mocked(createDepartment).mockRejectedValue(new Error('boom'));

      const { createDepartmentAction } = await import('../department-actions');
      const result = await createDepartmentAction(createFormData({ name: 'Engineering' }));

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('updateDepartmentAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { updateDepartmentAction } = await import('../department-actions');
      const result = await updateDepartmentAction(
        createFormData({ id: FAKE_DEPARTMENT_ID, name: 'New Name' }),
      );
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success when updating name', async () => {
      authenticatedUser();
      const { updateDepartment } = await import('@/lib/services/departments');
      const mockDept = { id: FAKE_DEPARTMENT_ID, name: 'Renamed' };
      vi.mocked(updateDepartment).mockResolvedValue(mockDept as never);

      const { updateDepartmentAction } = await import('../department-actions');
      const result = await updateDepartmentAction(
        createFormData({ id: FAKE_DEPARTMENT_ID, name: 'Renamed' }),
      );

      expect(result).toEqual({ success: true, data: mockDept });
      expect(updateDepartment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_DEPARTMENT_ID,
          name: 'Renamed',
          actorId: FAKE_USER_ID,
        }),
      );
    });

    it('returns success when archiving', async () => {
      authenticatedUser();
      const { updateDepartment } = await import('@/lib/services/departments');
      const mockDept = { id: FAKE_DEPARTMENT_ID, isArchived: true };
      vi.mocked(updateDepartment).mockResolvedValue(mockDept as never);

      const { updateDepartmentAction } = await import('../department-actions');
      const result = await updateDepartmentAction(
        createFormData({ id: FAKE_DEPARTMENT_ID, isArchived: 'true' }),
      );

      expect(result).toEqual({ success: true, data: mockDept });
      expect(updateDepartment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_DEPARTMENT_ID,
          isArchived: true,
          actorId: FAKE_USER_ID,
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Agent Key Actions
// ---------------------------------------------------------------------------

describe('Agent Key Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAgentKeyAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { createAgentKeyAction } = await import('../agent-key-actions');
      const result = await createAgentKeyAction(createFormData({ name: 'My Agent' }));
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error for missing name', async () => {
      authenticatedUser();
      const { createAgentKeyAction } = await import('../agent-key-actions');
      const result = await createAgentKeyAction(createFormData({ name: '' }));
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success with key and fullKey', async () => {
      authenticatedUser();
      const { createAgentKey } = await import('@/lib/services/agent-keys');
      const mockResult = {
        key: { id: FAKE_KEY_ID, name: 'My Agent' },
        fullKey: 'wb_abc123_secret',
      };
      vi.mocked(createAgentKey).mockResolvedValue(mockResult as never);

      const { createAgentKeyAction } = await import('../agent-key-actions');
      const result = await createAgentKeyAction(createFormData({ name: 'My Agent' }));

      expect(result).toEqual({
        success: true,
        data: { key: mockResult.key, fullKey: mockResult.fullKey },
      });
      expect(createAgentKey).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'My Agent',
          createdBy: FAKE_USER_ID,
        }),
      );

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/agent-keys');
    });

    it('returns generic error on service failure', async () => {
      authenticatedUser();
      const { createAgentKey } = await import('@/lib/services/agent-keys');
      vi.mocked(createAgentKey).mockRejectedValue(new Error('boom'));

      const { createAgentKeyAction } = await import('../agent-key-actions');
      const result = await createAgentKeyAction(createFormData({ name: 'My Agent' }));

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('updateAgentKeyAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { updateAgentKeyAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyAction(
        createFormData({ id: FAKE_KEY_ID, name: 'Renamed' }),
      );
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success when updating name', async () => {
      authenticatedUser();
      const { updateAgentKey } = await import('@/lib/services/agent-keys');
      const mockKey = { id: FAKE_KEY_ID, name: 'Renamed' };
      vi.mocked(updateAgentKey).mockResolvedValue(mockKey as never);

      const { updateAgentKeyAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyAction(
        createFormData({ id: FAKE_KEY_ID, name: 'Renamed' }),
      );

      expect(result).toEqual({ success: true, data: mockKey });
      expect(updateAgentKey).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_KEY_ID,
          name: 'Renamed',
          actorId: FAKE_USER_ID,
        }),
      );
    });

    it('returns success when updating specialPrompt and isActive', async () => {
      authenticatedUser();
      const { updateAgentKey } = await import('@/lib/services/agent-keys');
      const mockKey = { id: FAKE_KEY_ID, specialPrompt: 'Be helpful', isActive: false };
      vi.mocked(updateAgentKey).mockResolvedValue(mockKey as never);

      const { updateAgentKeyAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyAction(
        createFormData({
          id: FAKE_KEY_ID,
          specialPrompt: 'Be helpful',
          isActive: 'false',
        }),
      );

      expect(result).toEqual({ success: true, data: mockKey });
      expect(updateAgentKey).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: FAKE_KEY_ID,
          specialPrompt: 'Be helpful',
          isActive: false,
          actorId: FAKE_USER_ID,
        }),
      );
    });
  });

  describe('rotateAgentKeyAction', () => {
    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { rotateAgentKeyAction } = await import('../agent-key-actions');
      const result = await rotateAgentKeyAction(FAKE_KEY_ID);
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success with key and fullKey', async () => {
      authenticatedUser();
      const { rotateAgentKey } = await import('@/lib/services/agent-keys');
      const mockResult = {
        key: { id: FAKE_KEY_ID, name: 'Rotated' },
        fullKey: 'wb_newid_newsecret',
      };
      vi.mocked(rotateAgentKey).mockResolvedValue(mockResult as never);

      const { rotateAgentKeyAction } = await import('../agent-key-actions');
      const result = await rotateAgentKeyAction(FAKE_KEY_ID);

      expect(result).toEqual({
        success: true,
        data: { key: mockResult.key, fullKey: mockResult.fullKey },
      });
      expect(rotateAgentKey).toHaveBeenCalledWith(expect.anything(), {
        id: FAKE_KEY_ID,
        actorId: FAKE_USER_ID,
      });

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/agent-keys');
    });

    it('returns generic error on service failure', async () => {
      authenticatedUser();
      const { rotateAgentKey } = await import('@/lib/services/agent-keys');
      vi.mocked(rotateAgentKey).mockRejectedValue(new Error('boom'));

      const { rotateAgentKeyAction } = await import('../agent-key-actions');
      const result = await rotateAgentKeyAction(FAKE_KEY_ID);

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });

  describe('updateAgentKeyPermissionsAction', () => {
    const validPermissions = [
      {
        projectId: FAKE_PROJECT_ID,
        departmentId: null,
        canRead: true,
        canCreate: true,
        canUpdate: false,
      },
    ];

    it('returns unauthorized when not authenticated', async () => {
      unauthenticated();
      const { updateAgentKeyPermissionsAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyPermissionsAction({
        keyId: FAKE_KEY_ID,
        permissions: validPermissions,
      });
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns validation error for invalid data', async () => {
      authenticatedUser();
      const { updateAgentKeyPermissionsAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyPermissionsAction({
        keyId: 'not-a-uuid',
        permissions: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success on valid update', async () => {
      authenticatedUser();
      const { updateAgentKeyPermissions } = await import('@/lib/services/agent-keys');
      vi.mocked(updateAgentKeyPermissions).mockResolvedValue(undefined as never);

      const { updateAgentKeyPermissionsAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyPermissionsAction({
        keyId: FAKE_KEY_ID,
        permissions: validPermissions,
      });

      expect(result).toEqual({ success: true });
      expect(updateAgentKeyPermissions).toHaveBeenCalledWith(expect.anything(), {
        keyId: FAKE_KEY_ID,
        permissions: validPermissions,
        actorId: FAKE_USER_ID,
      });

      const { revalidatePath } = await import('next/cache');
      expect(revalidatePath).toHaveBeenCalledWith('/agent-keys');
    });

    it('returns generic error on service failure', async () => {
      authenticatedUser();
      const { updateAgentKeyPermissions } = await import('@/lib/services/agent-keys');
      vi.mocked(updateAgentKeyPermissions).mockRejectedValue(new Error('boom'));

      const { updateAgentKeyPermissionsAction } = await import('../agent-key-actions');
      const result = await updateAgentKeyPermissionsAction({
        keyId: FAKE_KEY_ID,
        permissions: validPermissions,
      });

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    });
  });
});
