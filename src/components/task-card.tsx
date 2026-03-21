'use client';

import { Badge } from '@/components/ui/badge';
import type { Task } from '@/lib/types/database';

const priorityColor: Record<string, 'gray' | 'blue' | 'yellow' | 'red'> = {
  low: 'gray',
  medium: 'blue',
  high: 'yellow',
  critical: 'red',
};

const statusColor: Record<string, 'gray' | 'blue' | 'yellow' | 'green' | 'red'> = {
  todo: 'gray',
  in_progress: 'blue',
  blocked: 'yellow',
  done: 'green',
  cancelled: 'red',
  failed: 'red',
};

const statusLabel: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const priorityBorder: Record<string, string> = {
  low: 'border-l-slate-300 dark:border-l-slate-600',
  medium: 'border-l-blue-500',
  high: 'border-l-yellow-500',
  critical: 'border-l-red-500',
};

interface TaskCardProps {
  task: Task & { departments?: { name: string } | null };
  onClick: () => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const border = priorityBorder[task.priority] ?? priorityBorder.low;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[48px] w-full rounded-lg border-l-4 bg-white p-3 text-left shadow-sm transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${border}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge color={priorityColor[task.priority] ?? 'gray'}>{task.priority}</Badge>
        <Badge color={statusColor[task.status] ?? 'gray'}>
          {statusLabel[task.status] ?? task.status}
        </Badge>
      </div>

      <p className="mt-1.5 text-sm text-slate-900 dark:text-slate-100">{task.description}</p>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {task.departments?.name && (
          <>
            <span>{task.departments.name}</span>
            <span aria-hidden="true">&middot;</span>
          </>
        )}
        {task.due_date && (
          <>
            <span>Due {formatDueDate(task.due_date)}</span>
            <span aria-hidden="true">&middot;</span>
          </>
        )}
        <span>{timeAgo(task.updated_at)}</span>
      </div>
    </button>
  );
}
