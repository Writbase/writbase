'use client';

export function MobileHeader({ workspaceName }: { workspaceName?: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 text-white md:hidden">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
        className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-800"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
      <span className="truncate text-sm font-medium">{workspaceName ?? 'WritBase'}</span>
    </header>
  );
}
