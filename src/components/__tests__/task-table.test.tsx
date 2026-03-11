/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTable } from '../task-table';

// Helper to create a mock fetch that returns typed JSON
function mockFetch(handlers: Record<string, unknown>) {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    for (const [pattern, data] of Object.entries(handlers)) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data }),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
  }) as unknown as typeof globalThis.fetch;
}

const sampleTasks = [
  {
    id: 'task-1',
    project_id: 'proj-1',
    department_id: null,
    priority: 'high' as const,
    description: 'Fix login bug',
    notes: null,
    due_date: null,
    status: 'todo' as const,
    version: 1,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    created_by_type: 'human' as const,
    created_by_id: 'user-1',
    updated_by_type: 'human' as const,
    updated_by_id: 'user-1',
    source: 'dashboard' as const,
  },
  {
    id: 'task-2',
    project_id: 'proj-1',
    department_id: null,
    priority: 'low' as const,
    description: 'Update docs',
    notes: 'Some notes here',
    due_date: '2025-06-01',
    status: 'in_progress' as const,
    version: 2,
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-03T00:00:00Z',
    created_by_type: 'human' as const,
    created_by_id: 'user-1',
    updated_by_type: 'agent' as const,
    updated_by_id: 'agent-1',
    source: 'mcp' as const,
  },
];

describe('TaskTable', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading skeleton initially', () => {
    // Fetch never resolves, so we stay in loading state
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<TaskTable projectId="proj-1" />);

    // The loading skeleton uses animate-pulse divs
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders task rows when data is provided', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/tasks': sampleTasks,
        '/api/departments': [],
        '/api/settings': { department_required: false },
      }),
    );

    render(<TaskTable projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    expect(screen.getByText('Update docs')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
    // "To Do" appears in both the filter dropdown option and the badge, so use getAllByText
    const toDoElements = screen.getAllByText('To Do');
    expect(toDoElements.length).toBeGreaterThanOrEqual(1);
    const inProgressElements = screen.getAllByText('In Progress');
    expect(inProgressElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when no tasks', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/tasks': [],
        '/api/departments': [],
        '/api/settings': { department_required: false },
      }),
    );

    render(<TaskTable projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText(/No tasks found/)).toBeInTheDocument();
    });
  });

  it('renders column headers', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/tasks': sampleTasks,
        '/api/departments': [],
        '/api/settings': { department_required: false },
      }),
    );

    render(<TaskTable projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Priority')).toBeInTheDocument();
    });

    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders filter controls', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<TaskTable projectId="proj-1" />);

    expect(screen.getByLabelText('Search tasks')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
  });
});
