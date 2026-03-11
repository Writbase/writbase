'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AgentKeyForm } from '@/components/agent-key-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { AgentKey } from '@/lib/types/database';
import { formatRelativeTime } from '@/lib/utils/format';

type KeyRow = Omit<AgentKey, 'key_hash'>;

export function AgentKeyList() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agent-keys');
      if (!res.ok) throw new Error('Failed to fetch keys');
      const json = (await res.json()) as { data?: KeyRow[] };
      setKeys(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Keys</h1>
        <Button
          onClick={() => {
            setShowCreate(true);
          }}
        >
          Create Key
        </Button>
      </div>

      <div className="mt-6">
        {loading && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            </div>
            <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p className="mb-3 text-sm text-red-700 dark:text-red-400">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                void fetchKeys();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && keys.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No agent keys yet. Create one to get started.
          </div>
        )}

        {!loading && !error && keys.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Key Prefix</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Last Used</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {k.name}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                        {k.key_prefix}...
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={k.role === 'manager' ? 'purple' : 'blue'}>{k.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={k.is_active ? 'green' : 'red'}>
                        {k.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {k.last_used_at ? formatRelativeTime(k.last_used_at) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/agent-keys/${k.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
        }}
        title="Create Agent Key"
      >
        <AgentKeyForm
          onClose={() => {
            setShowCreate(false);
          }}
          onSuccess={() => {
            void fetchKeys();
          }}
        />
      </Modal>
    </>
  );
}
