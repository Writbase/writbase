-- Atomic task creation: INSERT task + event_log in a single transaction.
-- Accepts a single jsonb payload to avoid positional parameter bugs.
CREATE OR REPLACE FUNCTION create_task_with_event(p_payload jsonb)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project   projects%ROWTYPE;
  v_dept      departments%ROWTYPE;
  v_task      tasks%ROWTYPE;
  v_dept_id   uuid;
BEGIN
  -- 1. Validate project exists and is not archived
  SELECT * INTO v_project
    FROM projects
    WHERE id = (p_payload->>'project_id')::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found:Project not found';
  END IF;

  IF v_project.is_archived THEN
    RAISE EXCEPTION 'project_archived:Cannot create tasks in an archived project';
  END IF;

  -- 2. Validate department if provided
  v_dept_id := (p_payload->>'department_id')::uuid;
  IF v_dept_id IS NOT NULL THEN
    SELECT * INTO v_dept
      FROM departments
      WHERE id = v_dept_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'department_not_found:Department not found';
    END IF;

    IF v_dept.is_archived THEN
      RAISE EXCEPTION 'department_archived:Cannot create tasks in an archived department';
    END IF;
  END IF;

  -- 3. Insert task
  INSERT INTO tasks (
    project_id, department_id, priority, description, notes,
    due_date, status, version,
    created_by_type, created_by_id, updated_by_type, updated_by_id, source
  ) VALUES (
    (p_payload->>'project_id')::uuid,
    v_dept_id,
    COALESCE((p_payload->>'priority')::priority, 'medium'),
    p_payload->>'description',
    p_payload->>'notes',
    (p_payload->>'due_date')::timestamptz,
    COALESCE((p_payload->>'status')::status, 'todo'),
    1,
    (p_payload->>'created_by_type')::actor_type,
    p_payload->>'created_by_id',
    (p_payload->>'created_by_type')::actor_type,
    p_payload->>'created_by_id',
    (p_payload->>'source')::source
  )
  RETURNING * INTO v_task;

  -- 4. Insert event_log
  INSERT INTO event_log (
    event_category, target_type, target_id, event_type,
    actor_type, actor_id, actor_label, source
  ) VALUES (
    'task', 'task', v_task.id, 'task.created',
    (p_payload->>'actor_type')::actor_type,
    p_payload->>'actor_id',
    p_payload->>'actor_label',
    (p_payload->>'source')::source
  );

  RETURN v_task;
END;
$$;

-- Atomic task update: UPDATE task + event_log rows in a single transaction.
-- Does field-level diff in Postgres using IS DISTINCT FROM.
CREATE OR REPLACE FUNCTION update_task_with_events(p_payload jsonb)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old       tasks%ROWTYPE;
  v_new       tasks%ROWTYPE;
  v_task_id   uuid;
  v_version   integer;
  v_updates   jsonb;
  v_actor_type actor_type;
  v_actor_id  text;
  v_actor_label text;
  v_source    source;
BEGIN
  v_task_id   := (p_payload->>'task_id')::uuid;
  v_version   := (p_payload->>'version')::integer;
  v_updates   := p_payload->'fields';
  v_actor_type := (p_payload->>'actor_type')::actor_type;
  v_actor_id  := p_payload->>'actor_id';
  v_actor_label := p_payload->>'actor_label';
  v_source    := (p_payload->>'source')::source;

  -- 1. Fetch existing task
  SELECT * INTO v_old FROM tasks WHERE id = v_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found:Task not found';
  END IF;

  -- 2. Version check
  IF v_old.version <> v_version THEN
    RAISE EXCEPTION 'version_conflict:Version conflict: expected %, current is %', v_version, v_old.version;
  END IF;

  -- 3. Update task (only provided fields)
  UPDATE tasks SET
    priority      = COALESCE((v_updates->>'priority')::priority, priority),
    description   = COALESCE(v_updates->>'description', description),
    notes         = CASE WHEN v_updates ? 'notes' THEN v_updates->>'notes' ELSE notes END,
    department_id = CASE WHEN v_updates ? 'department_id' THEN (v_updates->>'department_id')::uuid ELSE department_id END,
    due_date      = CASE WHEN v_updates ? 'due_date' THEN (v_updates->>'due_date')::timestamptz ELSE due_date END,
    status        = COALESCE((v_updates->>'status')::status, status),
    version       = version + 1,
    updated_at    = now(),
    updated_by_type = v_actor_type,
    updated_by_id   = v_actor_id,
    source          = v_source
  WHERE id = v_task_id AND version = v_version
  RETURNING * INTO v_new;

  IF NOT FOUND THEN
    -- Race condition: version changed between SELECT and UPDATE
    RAISE EXCEPTION 'version_conflict:Task was modified concurrently';
  END IF;

  -- 4. Field-level diff using IS DISTINCT FROM, insert event_log rows
  IF v_new.priority IS DISTINCT FROM v_old.priority THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'priority', to_jsonb(v_old.priority::text), to_jsonb(v_new.priority::text), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  IF v_new.description IS DISTINCT FROM v_old.description THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'description', to_jsonb(v_old.description), to_jsonb(v_new.description), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  IF v_new.notes IS DISTINCT FROM v_old.notes THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'notes', to_jsonb(v_old.notes), to_jsonb(v_new.notes), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  IF v_new.department_id IS DISTINCT FROM v_old.department_id THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'department_id', to_jsonb(v_old.department_id), to_jsonb(v_new.department_id), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  IF v_new.due_date IS DISTINCT FROM v_old.due_date THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'due_date', to_jsonb(v_old.due_date), to_jsonb(v_new.due_date), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  IF v_new.status IS DISTINCT FROM v_old.status THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.updated', 'status', to_jsonb(v_old.status::text), to_jsonb(v_new.status::text), v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  RETURN v_new;
END;
$$;
