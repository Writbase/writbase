-- Session-to-task linking: track which Claude session worked on a task.
-- Enables "what did this session accomplish?" queries and cross-session resume.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Add session_id column to tasks
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE tasks ADD COLUMN session_id text;

CREATE INDEX idx_tasks_session_id ON tasks(session_id)
  WHERE session_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Recreate create_task_with_event to accept session_id
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_task_with_event(p_payload jsonb)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task tasks;
  v_project_id uuid;
  v_department_id uuid;
  v_workspace_id uuid;
BEGIN
  v_project_id := (p_payload ->> 'project_id')::uuid;
  v_department_id := (p_payload ->> 'department_id')::uuid;
  v_workspace_id := (p_payload ->> 'workspace_id')::uuid;

  -- Validate workspace_id is provided
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_required:workspace_id is required';
  END IF;

  -- Validate project exists, not archived, and belongs to workspace
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = v_project_id AND NOT is_archived AND workspace_id = v_workspace_id) THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = v_project_id) THEN
      RAISE EXCEPTION 'project_not_found:Project not found';
    END IF;
    IF EXISTS (SELECT 1 FROM projects WHERE id = v_project_id AND is_archived) THEN
      RAISE EXCEPTION 'project_archived:Project is archived';
    END IF;
    RAISE EXCEPTION 'project_not_found:Project not in workspace';
  END IF;

  -- Validate department if provided
  IF v_department_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM departments WHERE id = v_department_id AND NOT is_archived AND workspace_id = v_workspace_id) THEN
      IF NOT EXISTS (SELECT 1 FROM departments WHERE id = v_department_id) THEN
        RAISE EXCEPTION 'department_not_found:Department not found';
      END IF;
      IF EXISTS (SELECT 1 FROM departments WHERE id = v_department_id AND is_archived) THEN
        RAISE EXCEPTION 'department_archived:Department is archived';
      END IF;
      RAISE EXCEPTION 'department_not_found:Department not in workspace';
    END IF;
  END IF;

  -- Insert task (with session_id)
  INSERT INTO tasks (
    project_id, department_id, priority, description, notes, due_date, status,
    created_by_type, created_by_id, updated_by_type, updated_by_id, source,
    workspace_id, session_id
  ) VALUES (
    v_project_id,
    v_department_id,
    COALESCE(p_payload ->> 'priority', 'medium')::priority,
    p_payload ->> 'description',
    p_payload ->> 'notes',
    (p_payload ->> 'due_date')::timestamptz,
    COALESCE(p_payload ->> 'status', 'todo')::status,
    (p_payload ->> 'created_by_type')::actor_type,
    p_payload ->> 'created_by_id',
    (p_payload ->> 'created_by_type')::actor_type,
    p_payload ->> 'created_by_id',
    (p_payload ->> 'source')::source,
    v_workspace_id,
    p_payload ->> 'session_id'
  ) RETURNING * INTO v_task;

  -- Log task.created event
  INSERT INTO event_log (
    event_category, target_type, target_id, event_type,
    actor_type, actor_id, actor_label, source, workspace_id
  ) VALUES (
    'task', 'task', v_task.id, 'task.created',
    (p_payload ->> 'actor_type')::actor_type,
    p_payload ->> 'actor_id',
    p_payload ->> 'actor_label',
    (p_payload ->> 'source')::source,
    v_workspace_id
  );

  RETURN v_task;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Recreate update_task_with_events to accept session_id
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_task_with_events(p_payload jsonb)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old tasks;
  v_new tasks;
  v_fields jsonb;
  v_task_id uuid;
  v_version int;
BEGIN
  v_task_id := (p_payload ->> 'task_id')::uuid;
  v_version := (p_payload ->> 'version')::int;
  v_fields := p_payload -> 'fields';

  -- Fetch existing task
  SELECT * INTO v_old FROM tasks WHERE id = v_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found:Task not found';
  END IF;

  -- Version check
  IF v_old.version != v_version THEN
    RAISE EXCEPTION 'version_conflict:Expected version %, found %', v_version, v_old.version;
  END IF;

  -- Update task (with session_id)
  UPDATE tasks SET
    priority = COALESCE((v_fields ->> 'priority')::priority, priority),
    description = COALESCE(v_fields ->> 'description', description),
    notes = CASE WHEN v_fields ? 'notes' THEN v_fields ->> 'notes' ELSE notes END,
    department_id = CASE WHEN v_fields ? 'department_id' THEN (v_fields ->> 'department_id')::uuid ELSE department_id END,
    due_date = CASE WHEN v_fields ? 'due_date' THEN (v_fields ->> 'due_date')::timestamptz ELSE due_date END,
    status = COALESCE((v_fields ->> 'status')::status, status),
    is_archived = CASE WHEN v_fields ? 'is_archived' THEN (v_fields->>'is_archived')::boolean ELSE is_archived END,
    session_id = CASE WHEN v_fields ? 'session_id' THEN v_fields ->> 'session_id' ELSE session_id END,
    updated_by_type = (p_payload ->> 'actor_type')::actor_type,
    updated_by_id = p_payload ->> 'actor_id',
    source = (p_payload ->> 'source')::source,
    version = version + 1
  WHERE id = v_task_id AND version = v_version
  RETURNING * INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_conflict:Concurrent modification detected';
  END IF;

  -- Log field-level changes
  IF v_old.priority IS DISTINCT FROM v_new.priority THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'priority', to_jsonb(v_old.priority::text), to_jsonb(v_new.priority::text), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.description IS DISTINCT FROM v_new.description THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'description', to_jsonb(v_old.description), to_jsonb(v_new.description), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.notes IS DISTINCT FROM v_new.notes THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'notes', to_jsonb(v_old.notes), to_jsonb(v_new.notes), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.department_id IS DISTINCT FROM v_new.department_id THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'department_id', to_jsonb(v_old.department_id::text), to_jsonb(v_new.department_id::text), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.due_date IS DISTINCT FROM v_new.due_date THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'due_date', to_jsonb(v_old.due_date::text), to_jsonb(v_new.due_date::text), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.status IS DISTINCT FROM v_new.status THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'status', to_jsonb(v_old.status::text), to_jsonb(v_new.status::text), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.is_archived IS DISTINCT FROM v_new.is_archived THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id,
      CASE WHEN v_new.is_archived THEN 'task.archived' ELSE 'task.unarchived' END,
      'is_archived', to_jsonb(v_old.is_archived), to_jsonb(v_new.is_archived),
      (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label',
      (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  IF v_old.session_id IS DISTINCT FROM v_new.session_id THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'session_id', to_jsonb(v_old.session_id), to_jsonb(v_new.session_id), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
  END IF;

  RETURN v_new;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Force PostgREST schema cache reload
-- ══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
