'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createTaskAction, updateTaskAction } from '@/app/(dashboard)/actions/task-actions';
import { TaskHistoryPanel } from '@/components/task-history-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import type { Task } from '@/lib/types/database';

interface Department {
  id: string;
  name: string;
  is_archived?: boolean;
}

interface TaskFormProps {
  task?: Task | null;
  projectId: string;
  departments: Department[];
  departmentRequired?: boolean;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TaskForm({
  task,
  projectId,
  departments,
  departmentRequired = false,
  open,
  onClose,
  onSuccess,
}: TaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isEdit = !!task;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVersionConflict(false);

    const form = e.currentTarget;
    const formData = new FormData(form);

    if (task) {
      const result = await updateTaskAction({
        id: task.id,
        version: task.version,
        projectId,
        departmentId: (formData.get('departmentId') as string | null) ?? null,
        priority: formData.get('priority') as string,
        description: formData.get('description') as string,
        notes: (formData.get('notes') as string | null) ?? null,
        dueDate: (formData.get('dueDate') as string | null) ?? null,
        status: formData.get('status') as string,
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else if (result.code === 'version_conflict') {
        setVersionConflict(true);
      } else {
        setError(result.error ?? 'Failed to update task');
      }
    } else {
      formData.set('projectId', projectId);
      const result = await createTaskAction(formData);

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error ?? 'Failed to create task');
      }
    }

    setLoading(false);
  }

  function handleRefresh() {
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'}>
      {versionConflict ? (
        <div className="space-y-4">
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/30">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              This task was modified by someone else. Please refresh and try again.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="task-description"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="task-description"
              name="description"
              required
              minLength={3}
              rows={2}
              defaultValue={task?.description ?? ''}
              placeholder="Describe the task..."
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="task-notes"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Notes
            </label>
            <textarea
              id="task-notes"
              name="notes"
              rows={2}
              defaultValue={task?.notes ?? ''}
              placeholder="Additional notes..."
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="task-priority"
              name="priority"
              label="Priority"
              defaultValue={task?.priority ?? 'medium'}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>

            <Select
              id="task-status"
              name="status"
              label="Status"
              defaultValue={task?.status ?? 'todo'}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </Select>
          </div>

          <Select
            id="task-department"
            name="departmentId"
            label={departmentRequired ? 'Department *' : 'Department'}
            required={departmentRequired}
            defaultValue={task?.department_id ?? ''}
          >
            <option value="">{departmentRequired ? 'Select a department' : 'None'}</option>
            {departments
              .filter((d) => !d.is_archived)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            {/* Show archived department for existing task if it references one */}
            {task?.department_id &&
              !departments.find((d) => d.id === task.department_id && !d.is_archived) &&
              (() => {
                const archived = departments.find((d) => d.id === task.department_id);
                return archived ? (
                  <option key={archived.id} value={archived.id} disabled>
                    {archived.name} (Archived)
                  </option>
                ) : null;
              })()}
          </Select>

          <Input
            id="task-due-date"
            name="dueDate"
            label="Due Date"
            type="date"
            defaultValue={task?.due_date ? task.due_date.split('T')[0] : ''}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            {task && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowHistory(true);
                }}
              >
                History
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEdit
                  ? 'Saving...'
                  : 'Creating...'
                : isEdit
                  ? 'Save Changes'
                  : 'Create Task'}
            </Button>
          </div>
        </form>
      )}

      {task && (
        <TaskHistoryPanel
          taskId={task.id}
          isOpen={showHistory}
          onClose={() => {
            setShowHistory(false);
          }}
        />
      )}
    </Modal>
  );
}
