/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tasks',
}));

// Mock next/link as a plain anchor
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: (props: Record<string, unknown>) =>
      React.createElement('a', { href: props.href }, props.children as React.ReactNode),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
    },
  }),
}));

// Mock child components that are complex and not under test
vi.mock('@/components/task-form', () => ({
  TaskForm: () => null,
}));

vi.mock('@/components/sidebar-project-selector', async () => {
  const React = await import('react');
  return {
    SidebarProjectSelector: () => React.createElement('div', { 'data-testid': 'project-selector' }),
  };
});

vi.mock('@/components/sidebar-department-selector', async () => {
  const React = await import('react');
  return {
    SidebarDepartmentSelector: () =>
      React.createElement('div', { 'data-testid': 'department-selector' }),
  };
});

vi.mock('@/components/sidebar-modals', () => ({
  SidebarModals: () => null,
}));

vi.mock('@/components/agent-key-form', () => ({
  AgentKeyForm: () => null,
}));

// Modal uses HTMLDialogElement.showModal()/close() which jsdom doesn't support
vi.mock('@/components/ui/modal', async () => {
  const React = await import('react');
  return {
    Modal: ({
      open,
      children,
      title,
    }: {
      open: boolean;
      children: React.ReactNode;
      title: string;
    }) =>
      open
        ? React.createElement('div', { 'data-testid': 'modal', 'aria-label': title }, children)
        : null,
  };
});

// Provide dialog mock for jsdom (doesn't support HTMLDialogElement)
if (
  typeof globalThis.HTMLElement !== 'undefined' &&
  typeof globalThis.HTMLDialogElement === 'undefined'
) {
  // @ts-expect-error -- jsdom shim
  globalThis.HTMLDialogElement = class HTMLDialogElement extends HTMLElement {
    open = false;
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
  };
}
