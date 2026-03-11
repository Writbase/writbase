/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../sidebar';

vi.mock('@/app/(dashboard)/actions/project-actions', () => ({
  updateProjectAction: vi.fn(),
}));

vi.mock('@/app/(dashboard)/actions/department-actions', () => ({
  updateDepartmentAction: vi.fn(),
}));

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

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nav links for Tasks and Agent Keys', () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/projects': [], '/api/departments': [] }));

    render(<Sidebar userEmail="test@example.com" />);

    const tasksLink = screen.getByText('Tasks');
    expect(tasksLink).toBeInTheDocument();
    expect(tasksLink.closest('a')).toHaveAttribute('href', '/tasks');

    const agentKeysLink = screen.getByText('Agent Keys');
    expect(agentKeysLink).toBeInTheDocument();
    expect(agentKeysLink.closest('a')).toHaveAttribute('href', '/agent-keys');
  });

  it('renders user email', () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/projects': [], '/api/departments': [] }));

    render(<Sidebar userEmail="admin@writbase.io" />);

    expect(screen.getByText('admin@writbase.io')).toBeInTheDocument();
  });

  it('renders Sign out button', () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/projects': [], '/api/departments': [] }));

    render(<Sidebar userEmail="test@example.com" />);

    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('renders WritBase brand name', () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/projects': [], '/api/departments': [] }));

    render(<Sidebar />);

    expect(screen.getByText('WritBase')).toBeInTheDocument();
  });

  it('renders project and department selectors', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/projects': [
          {
            id: 'p1',
            name: 'Project Alpha',
            slug: 'alpha',
            is_archived: false,
            created_at: '2025-01-01T00:00:00Z',
            created_by: null,
          },
        ],
        '/api/departments': [
          {
            id: 'd1',
            name: 'Engineering',
            slug: 'eng',
            is_archived: false,
            created_at: '2025-01-01T00:00:00Z',
            created_by: null,
          },
        ],
      }),
    );

    render(<Sidebar userEmail="test@example.com" />);

    // The selectors are mocked as data-testid stubs
    await waitFor(() => {
      expect(screen.getByTestId('project-selector')).toBeInTheDocument();
      expect(screen.getByTestId('department-selector')).toBeInTheDocument();
    });
  });
});
