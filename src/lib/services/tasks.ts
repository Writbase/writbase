import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventLog, Task } from '@/lib/types/database';
import type { ActorType, Priority, Source, Status } from '@/lib/types/enums';
import { AppError } from '@/lib/utils/errors';

/**
 * Parse the error code prefix from a Postgres RAISE EXCEPTION message.
 * Expected format: 'error_code:human-readable message'
 */
function parseRpcErrorCode(message: string): string | null {
  const colonIndex = message.indexOf(':');
  if (colonIndex === -1) return null;
  return message.slice(0, colonIndex);
}

/**
 * Extract the human-readable part from 'error_code:message' format.
 * Falls back to the full message if format doesn't match.
 */
function parseRpcErrorMessage(message: string): string {
  const colonIndex = message.indexOf(':');
  if (colonIndex === -1) return message;
  return message.slice(colonIndex + 1).trim() || message;
}

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
    search?: string;
  } = {},
): Promise<TaskWithRelations[]> {
  let query = supabase.from('tasks').select('*, projects(name), departments(name)');

  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.search)
    query = query.textSearch('search_vector', filters.search, { type: 'websearch' });

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
  // Enforce department_required setting
  if (!params.departmentId) {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('department_required')
      .single();

    if (settings?.department_required) {
      throw new AppError('department_required', 'Department is required by system settings');
    }
  }

  const payload = {
    project_id: params.projectId,
    department_id: params.departmentId ?? null,
    priority: params.priority ?? 'medium',
    description: params.description,
    notes: params.notes ?? null,
    due_date: params.dueDate ?? null,
    status: params.status ?? 'todo',
    created_by_type: params.createdByType,
    created_by_id: params.createdById,
    actor_type: params.createdByType,
    actor_id: params.createdById,
    actor_label: params.createdByType === 'human' ? 'admin' : params.createdById,
    source: params.source,
  };

  const { data, error } = await supabase
    .rpc('create_task_with_event', {
      p_payload: payload,
    })
    .single();

  if (error) {
    const code = parseRpcErrorCode(error.message);
    if (code === 'project_not_found')
      throw new AppError('project_not_found', 'Project not found', 404);
    if (code === 'project_archived')
      throw new AppError('project_archived', 'Cannot create tasks in an archived project');
    if (code === 'department_not_found')
      throw new AppError('department_not_found', 'Department not found', 404);
    if (code === 'department_archived')
      throw new AppError('department_archived', 'Cannot create tasks in an archived department');
    throw new AppError(code ?? 'internal_error', parseRpcErrorMessage(error.message));
  }

  return data as Task;
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
  const fieldMap: Record<string, string> = {
    projectId: 'project_id',
    departmentId: 'department_id',
    priority: 'priority',
    description: 'description',
    notes: 'notes',
    dueDate: 'due_date',
    status: 'status',
  };

  // Build the fields object with DB column names
  const fields: Record<string, unknown> = {};
  for (const [key, dbCol] of Object.entries(fieldMap)) {
    if (key in params.fields) {
      fields[dbCol] = (params.fields as Record<string, unknown>)[key] ?? null;
    }
  }

  const payload = {
    task_id: params.id,
    version: params.version,
    fields,
    actor_type: params.updatedByType,
    actor_id: params.updatedById,
    actor_label: params.updatedByType === 'human' ? 'admin' : params.updatedById,
    source: params.source,
  };

  const { data, error } = await supabase
    .rpc('update_task_with_events', {
      p_payload: payload,
    })
    .single();

  if (error) {
    const code = parseRpcErrorCode(error.message);
    if (code === 'task_not_found') throw new AppError('task_not_found', 'Task not found', 404);
    if (code === 'version_conflict')
      throw new AppError('version_conflict', parseRpcErrorMessage(error.message), 409);
    throw new AppError(code ?? 'internal_error', parseRpcErrorMessage(error.message));
  }

  return data as Task;
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
