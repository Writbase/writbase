/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentKeyList } from '../agent-key-list';

function mockFetch(data: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data }),
    }),
  ) as unknown as typeof globalThis.fetch;
}

const sampleKeys = [
  {
    id: 'key-1',
    name: 'CI Bot',
    role: 'worker' as const,
    key_prefix: 'wb_abc',
    is_active: true,
    special_prompt: null,
    created_at: '2025-01-01T00:00:00Z',
    last_used_at: '2025-06-01T12:00:00Z',
    created_by: 'user-1',
  },
  {
    id: 'key-2',
    name: 'Deploy Agent',
    role: 'manager' as const,
    key_prefix: 'wb_xyz',
    is_active: false,
    special_prompt: null,
    created_at: '2025-02-01T00:00:00Z',
    last_used_at: null,
    created_by: 'user-1',
  },
];

describe('AgentKeyList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<AgentKeyList />);

    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders agent key rows when data loads', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText('CI Bot')).toBeInTheDocument();
    });

    expect(screen.getByText('Deploy Agent')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(screen.getByText('manager')).toBeInTheDocument();
    // "Active" appears in both the table header and the badge
    const activeElements = screen.getAllByText('Active');
    expect(activeElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('renders empty state when no keys', async () => {
    vi.stubGlobal('fetch', mockFetch([]));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText(/No agent keys yet/)).toBeInTheDocument();
    });
  });

  it('renders key prefix with ellipsis', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText('wb_abc...')).toBeInTheDocument();
      expect(screen.getByText('wb_xyz...')).toBeInTheDocument();
    });
  });

  it('renders Manage links for each key', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      const manageLinks = screen.getAllByText('Manage');
      expect(manageLinks).toHaveLength(2);
      expect(manageLinks[0].closest('a')).toHaveAttribute('href', '/agent-keys/key-1');
      expect(manageLinks[1].closest('a')).toHaveAttribute('href', '/agent-keys/key-2');
    });
  });

  it('renders Create Key button', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<AgentKeyList />);

    expect(screen.getByText('Create Key')).toBeInTheDocument();
  });
});
