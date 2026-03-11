import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventLog, Task } from '@/lib/types/database';
import type { ActorType, Priority, Source, Status } from '@/lib/types/enums';
import { AppError } from '@/lib/utils/errors';
import { logEvent } from './event-log';

export interface TaskWithRelations extends Task {
  projects?: { name: string } | null;
  departments?: { name: string } | null;
}

export async function listTasks(
  supabase: SupabaseClient,
  filters: {
    projectId?: string;
    departmentId?: string;
    status?: Status;
    priority?: Priority;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  } = {},
): Promise<TaskWithRelations[]> {
  let query = supabase.from('tasks').select('*, projects(name), departments(name)');

  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);

  const sortBy = filters.sortBy ?? 'created_at';
  const sortOrder = filters.sortOrder ?? 'desc';
  const validSortColumns = ['created_at', 'updated_at', 'due_date', 'priority', 'status'];
  const column = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  query = query.order(column, { ascending: sortOrder === 'asc' });

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as TaskWithRelations[];
}

export async function createTask(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    departmentId?: string | null;
    priority?: Priority;
    description: string;
    notes?: string | null;
    dueDate?: string | null;
    status?: Status;
    createdByType: ActorType;
    createdById: string;
    source: Source;
  },
): Promise<Task> {
  // Validate project is not archived
  const projResult = await supabase
    .from('projects')
    .select('id, is_archived')
    .eq('id', params.projectId)
    .single();

  const proj = projResult.data as { id: string; is_archived: boolean } | null;
  if (projResult.error || !proj) {
    throw new AppError('project_not_found', 'Project not found', 404);
  }
  if (proj.is_archived) {
    throw new AppError('project_archived', 'Cannot create tasks in an archived project');
  }

  // Validate department if provided
  if (params.departmentId) {
    const deptResult = await supabase
      .from('departments')
      .select('id, is_archived')
      .eq('id', params.departmentId)
      .single();

    const department = deptResult.data as { id: string; is_archived: boolean } | null;
    if (deptResult.error || !department) {
      throw new AppError('department_not_found', 'Department not found', 404);
    }
    if (department.is_archived) {
      throw new AppError('department_archived', 'Cannot create tasks in an archived department');
    }
  }

  const insertResult = await supabase
    .from('tasks')
    .insert({
      project_id: params.projectId,
      department_id: params.departmentId ?? null,
      priority: params.priority ?? 'medium',
      description: params.description,
      notes: params.notes ?? null,
      due_date: params.dueDate ?? null,
      status: params.status ?? 'todo',
      version: 1,
      created_by_type: params.createdByType,
      created_by_id: params.createdById,
      updated_by_type: params.createdByType,
      updated_by_id: params.createdById,
      source: params.source,
    })
    .select()
    .single();

  if (insertResult.error) throw insertResult.error;
  const task = insertResult.data as Task;

  await logEvent(supabase, {
    eventCategory: 'task',
    targetType: 'task',
    targetId: task.id,
    eventType: 'task.created',
    actorType: params.createdByType,
    actorId: params.createdById,
    actorLabel: params.createdByType === 'human' ? 'admin' : params.createdById,
    source: params.source,
  });

  return task;
}

export async function updateTask(
  supabase: SupabaseClient,
  params: {
    id: string;
    version: number;
    fields: {
      projectId?: string;
      departmentId?: string | null;
      priority?: Priority;
      description?: string;
      notes?: string | null;
      dueDate?: string | null;
      status?: Status;
    };
    updatedByType: ActorType;
    updatedById: string;
    source: Source;
  },
): Promise<Task> {
  // Build the update object
  const updates: Record<string, unknown> = {
    version: params.version + 1,
    updated_by_type: params.updatedByType,
    updated_by_id: params.updatedById,
    source: params.source,
    updated_at: new Date().toISOString(),
  };

  const fieldMap: Record<string, string> = {
    projectId: 'project_id',
    departmentId: 'department_id',
    priority: 'priority',
    description: 'description',
    notes: 'notes',
    dueDate: 'due_date',
    status: 'status',
  };

  for (const [key, dbCol] of Object.entries(fieldMap)) {
    if (key in params.fields) {
      updates[dbCol] = (params.fields as Record<string, unknown>)[key] ?? null;
    }
  }

  // Optimistic concurrency: update only if version matches
  const updateResult = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', params.id)
    .eq('version', params.version)
    .select()
    .single();

  if (updateResult.error) {
    // If no rows matched, it's a version conflict
    if (updateResult.error.code === 'PGRST116') {
      // Check if the task exists at all
      const existResult = await supabase
        .from('tasks')
        .select('version')
        .eq('id', params.id)
        .single();
      const existing = existResult.data as { version: number } | null;

      if (existing) {
        throw new AppError(
          'version_conflict',
          `Version conflict: expected ${params.version}, current is ${String(existing.version)}`,
          409,
        );
      }
      throw new AppError('task_not_found', 'Task not found', 404);
    }
    throw updateResult.error;
  }

  const updatedTask = updateResult.data as Task;

  // Log field-level changes
  // Fetch the old values for logging
  for (const [key, dbCol] of Object.entries(fieldMap)) {
    if (key in params.fields) {
      await logEvent(supabase, {
        eventCategory: 'task',
        targetType: 'task',
        targetId: params.id,
        eventType: 'task.updated',
        fieldName: dbCol,
        newValue: (params.fields as Record<string, unknown>)[key] ?? null,
        actorType: params.updatedByType,
        actorId: params.updatedById,
        actorLabel: params.updatedByType === 'human' ? 'admin' : params.updatedById,
        source: params.source,
      });
    }
  }

  return updatedTask;
}

export async function getTaskHistory(
  supabase: SupabaseClient,
  taskId: string,
): Promise<EventLog[]> {
  const { data, error } = await supabase
    .from('event_log')
    .select('*')
    .eq('target_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as EventLog[];
}
