'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskForm } from '@/components/task-form'
import type { Task } from '@/lib/types/database'
import type { Priority, Status } from '@/lib/types/enums'

interface Department {
  id: string
  name: string
}

interface TaskTableProps {
  projectId: string
  departmentId?: string
}

const priorityColor: Record<Priority, 'gray' | 'blue' | 'yellow' | 'red'> = {
  low: 'gray',
  medium: 'blue',
  high: 'yellow',
  critical: 'red',
}

const statusColor: Record<Status, 'gray' | 'blue' | 'yellow' | 'green' | 'red'> = {
  todo: 'gray',
  in_progress: 'blue',
  blocked: 'yellow',
  done: 'green',
  cancelled: 'red',
}

const statusLabel: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}

const PAGE_SIZE = 25

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`
  return formatDate(dateStr)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

type SortColumn = 'priority' | 'description' | 'department_id' | 'due_date' | 'created_at' | 'status'

export function TaskTable({ projectId, departmentId }: TaskTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tasks, setTasks] = useState<Task[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const sortBy = (searchParams.get('sortBy') as SortColumn) || 'created_at'
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'

  const fetchTasks = useCallback(async (currentOffset: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('projectId', projectId)
      if (departmentId) params.set('departmentId', departmentId)
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      params.set('limit', String(PAGE_SIZE + 1))
      params.set('offset', String(currentOffset))

      const res = await fetch(`/api/tasks?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        const items: Task[] = json.data ?? []
        if (items.length > PAGE_SIZE) {
          setHasMore(true)
          setTasks(items.slice(0, PAGE_SIZE))
        } else {
          setHasMore(false)
          setTasks(items)
        }
      }
    } catch {
      // fail silently
    }
    setLoading(false)
  }, [projectId, departmentId, sortBy, sortOrder])

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (res.ok) {
        const json = await res.json()
        setDepartments((json.data ?? []).filter((d: Department & { is_archived?: boolean }) => !d.is_archived))
      }
    } catch {
      // fail silently
    }
  }, [])

  useEffect(() => {
    setOffset(0)
    fetchTasks(0)
  }, [fetchTasks])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  function handleSort(column: SortColumn) {
    const params = new URLSearchParams(searchParams.toString())
    if (sortBy === column) {
      params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      params.set('sortBy', column)
      params.set('sortOrder', 'asc')
    }
    router.push(`?${params.toString()}`)
  }

  function handlePrev() {
    const newOffset = Math.max(0, offset - PAGE_SIZE)
    setOffset(newOffset)
    fetchTasks(newOffset)
  }

  function handleNext() {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    fetchTasks(newOffset)
  }

  function handleRowClick(task: Task) {
    setEditingTask(task)
    setShowForm(true)
  }

  function handleAddTask() {
    setEditingTask(null)
    setShowForm(true)
  }

  function handleFormClose() {
    setShowForm(false)
    setEditingTask(null)
  }

  function handleFormSuccess() {
    fetchTasks(offset)
  }

  function getDepartmentName(depId: string | null): string {
    if (!depId) return '-'
    const dep = departments.find((d) => d.id === depId)
    return dep?.name ?? '-'
  }

  function renderSortIcon(column: SortColumn) {
    if (sortBy !== column) return null
    return (
      <span className="ml-1 text-blue-500">
        {sortOrder === 'asc' ? '\u2191' : '\u2193'}
      </span>
    )
  }

  const columns: { key: SortColumn; label: string }[] = [
    { key: 'priority', label: 'Priority' },
    { key: 'description', label: 'Description' },
    { key: 'department_id', label: 'Department' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'created_at', label: 'Created' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tasks</h1>
        <Button onClick={handleAddTask}>Add Task</Button>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No tasks found. Click &quot;Add Task&quot; to create one.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
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
                    onClick={() => handleRowClick(task)}
                    className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                      idx % 2 === 1 ? 'bg-slate-25 dark:bg-slate-900/50' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge color={priorityColor[task.priority]}>
                        {task.priority}
                      </Badge>
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
                      {getDepartmentName(task.department_id)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {task.due_date ? formatRelativeDate(task.due_date) : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {formatDate(task.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge color={statusColor[task.status]}>
                        {statusLabel[task.status]}
                      </Badge>
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
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={handlePrev}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!hasMore}
                onClick={handleNext}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <TaskForm
        task={editingTask}
        projectId={projectId}
        departments={departments}
        open={showForm}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </div>
  )
}
