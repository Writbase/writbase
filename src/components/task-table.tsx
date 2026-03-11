'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskForm } from '@/components/task-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/types/database';
import type { Priority, Status } from '@/lib/types/enums';

interface Department {
  id: string;
  name: string;
  is_archived?: boolean;
}

interface TaskTableProps {
  projectId: string;
  departmentId?: string;
}

const priorityColor: Record<Priority, 'gray' | 'blue' | 'yellow' | 'red'> = {
  low: 'gray',
  medium: 'blue',
  high: 'yellow',
  critical: 'red',
};

const statusColor: Record<Status, 'gray' | 'blue' | 'yellow' | 'green' | 'red'> = {
  todo: 'gray',
  in_progress: 'blue',
  blocked: 'yellow',
  done: 'green',
  cancelled: 'red',
};

const statusLabel: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

const PAGE_SIZE = 25;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return formatDate(dateStr);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

type SortColumn =
  | 'priority'
  | 'description'
  | 'department_id'
  | 'due_date'
  | 'created_at'
  | 'status';

export function TaskTable({ projectId, departmentId }: TaskTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [_departments, setDepartments] = useState<Department[]>([]);
  const [allDepartments, setAllDepartments] = useState<(Department & { is_archived?: boolean })[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortBy = (searchParams.get('sortBy') as SortColumn | null) ?? 'created_at';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc' | null) ?? 'desc';

  const fetchTasks = useCallback(
    async (currentOffset: number, signal?: AbortSignal) => {
      setLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        params.set('projectId', projectId);
        if (departmentId) params.set('departmentId', departmentId);
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
        params.set('limit', String(PAGE_SIZE + 1));
        params.set('offset', String(currentOffset));

        const res = await fetch(`/api/tasks?${params.toString()}`, { signal });
        if (!res.ok) throw new Error('Failed to load tasks');
        const json = (await res.json()) as { data?: Task[] };
        const items: Task[] = json.data ?? [];
        if (items.length > PAGE_SIZE) {
          setHasMore(true);
          setTasks(items.slice(0, PAGE_SIZE));
        } else {
          setHasMore(false);
          setTasks(items);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load tasks');
      }
      setLoading(false);
    },
    [projectId, departmentId, sortBy, sortOrder],
  );

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const json = (await res.json()) as { data?: (Department & { is_archived?: boolean })[] };
        const all = json.data ?? [];
        setAllDepartments(all);
        setDepartments(all.filter((d) => !d.is_archived));
      }
    } catch {
      // fail silently
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    const controller = new AbortController();
    void fetchTasks(0, controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchTasks]);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when task list changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [tasks]);

  function handleSort(column: SortColumn) {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === column) {
      params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      params.set('sortBy', column);
      params.set('sortOrder', 'asc');
    }
    router.push(`?${params.toString()}`);
  }

  function handlePrev() {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
    void fetchTasks(newOffset);
  }

  function handleNext() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    void fetchTasks(newOffset);
  }

  function handleRowClick(task: Task) {
    setEditingTask(task);
    setShowForm(true);
  }

  function handleAddTask() {
    setEditingTask(null);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingTask(null);
  }

  function handleFormSuccess() {
    void fetchTasks(offset);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (tasks.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, tasks.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < tasks.length) {
          handleRowClick(tasks[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (showForm) {
          handleFormClose();
        } else {
          setSelectedIndex(-1);
        }
        break;
    }
  }

  function getDepartmentInfo(depId: string | null): { name: string; isArchived: boolean } {
    if (!depId) return { name: '-', isArchived: false };
    const dep = allDepartments.find((d) => d.id === depId);
    if (!dep) return { name: '-', isArchived: false };
    return { name: dep.name, isArchived: !!dep.is_archived };
  }

  function renderSortIcon(column: SortColumn) {
    if (sortBy !== column) return null;
    return <span className="ml-1 text-blue-500">{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>;
  }

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'priority', label: 'Priority' },
    { key: 'description', label: 'Description' },
    { key: 'department_id', label: 'Department' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'created_at', label: 'Created' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tasks</h1>
        <Button onClick={handleAddTask}>Add Task</Button>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-3 text-sm text-red-700 dark:text-red-400">{fetchError}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void fetchTasks(offset);
            }}
          >
            Retry
          </Button>
        </div>
      ) : loading && tasks.length === 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
          </div>
          <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No tasks found. Click &quot;Add Task&quot; to create one.
        </div>
      ) : (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: div with role="grid" provides keyboard navigation for task list */}
          <div
            ref={containerRef}
            tabIndex={0}
            role="grid"
            aria-label="Task list"
            aria-activedescendant={
              selectedIndex >= 0 ? `task-row-${tasks[selectedIndex]?.id}` : undefined
            }
            onKeyDown={handleKeyDown}
            className="overflow-x-auto rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-700"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => {
                        handleSort(col.key);
                      }}
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      {col.label}
                      {renderSortIcon(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900">
                {tasks.map((task, idx) => (
                  <tr
                    key={task.id}
                    id={`task-row-${task.id}`}
                    onClick={() => {
                      handleRowClick(task);
                    }}
                    className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                      idx % 2 === 1 ? 'bg-slate-25 dark:bg-slate-900/50' : ''
                    } ${selectedIndex === idx ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge color={priorityColor[task.priority]}>{task.priority}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-2.5 text-slate-900 dark:text-slate-100">
                      <div className="font-medium">{truncate(task.description, 80)}</div>
                      {task.notes && (
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {truncate(task.notes, 60)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {(() => {
                        const dept = getDepartmentInfo(task.department_id);
                        if (dept.isArchived) {
                          return (
                            <span className="text-slate-400 dark:text-slate-500">
                              {dept.name} <span className="text-xs">(Archived)</span>
                            </span>
                          );
                        }
                        return dept.name;
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {task.due_date ? formatRelativeDate(task.due_date) : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {formatDate(task.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge color={statusColor[task.status]}>{statusLabel[task.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Showing {offset + 1}&ndash;{offset + tasks.length}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={offset === 0} onClick={handlePrev}>
                Previous
              </Button>
              <Button variant="secondary" disabled={!hasMore} onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <TaskForm
        task={editingTask}
        projectId={projectId}
        departments={allDepartments}
        open={showForm}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
