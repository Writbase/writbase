'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { EventLog } from '@/lib/types/database';
import type { ActorType, Source } from '@/lib/types/enums';

interface TaskHistoryPanelProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

const actorColor: Record<ActorType, 'blue' | 'purple' | 'gray'> = {
  human: 'blue',
  agent: 'purple',
  system: 'gray',
};

const sourceColor: Record<Source, 'blue' | 'purple' | 'gray' | 'green'> = {
  ui: 'blue',
  mcp: 'purple',
  api: 'green',
  system: 'gray',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string' && value === '') return '(empty)';
  return String(value);
}

function SkeletonTimeline() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            {i < 3 && <div className="w-0.5 flex-1 animate-pulse bg-slate-200 dark:bg-slate-700" />}
          </div>
          <div className="flex-1 space-y-2 pb-6">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-8 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TaskHistoryPanel({ taskId, isOpen, onClose }: TaskHistoryPanelProps) {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/tasks/${taskId}/history`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load history');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          const items: EventLog[] = json.data ?? [];
          // Most recent first
          items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setEvents(items);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Task History</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close history panel"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <SkeletonTimeline />
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No history for this task
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((event, idx) => (
                <div key={event.id} className="flex gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-blue-500 bg-white dark:bg-slate-900" />
                    {idx < events.length - 1 && (
                      <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>

                  {/* Event content */}
                  <div className="flex-1 pb-6">
                    {/* Timestamp */}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(event.created_at)}
                    </p>

                    {/* Actor + event type */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge color={actorColor[event.actor_type]}>{event.actor_label}</Badge>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {formatEventType(event.event_type)}
                      </span>
                      <Badge color={sourceColor[event.source]}>{event.source}</Badge>
                    </div>

                    {/* Field change diff */}
                    {event.field_name && (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          {formatFieldName(event.field_name)}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {event.old_value !== null && event.old_value !== undefined && (
                            <>
                              <span className="line-through text-red-600 dark:text-red-400">
                                {formatValue(event.old_value)}
                              </span>
                              <span className="text-slate-400">&rarr;</span>
                            </>
                          )}
                          <span className="text-green-600 dark:text-green-400">
                            {formatValue(event.new_value)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
