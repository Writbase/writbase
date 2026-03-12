-- Inter-Agent Task Exchange: schema additions for task assignment,
-- delegation safety, webhook notifications, and agent discovery.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Add 'failed' to status enum (A2A alignment)
-- ══════════════════════════════════════════════════════════════════════
ALTER TYPE status ADD VALUE IF NOT EXISTS 'failed';

-- ══════════════════════════════════════════════════════════════════════
-- 2. Task assignment columns + delegation safety
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE tasks
  ADD COLUMN assigned_to_agent_key_id uuid REFERENCES agent_keys(id),
  ADD COLUMN requested_by_agent_key_id uuid REFERENCES agent_keys(id),
  ADD COLUMN delegation_depth integer NOT NULL DEFAULT 0,
  ADD COLUMN assignment_chain uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE tasks
  ADD CONSTRAINT chk_delegation_depth CHECK (delegation_depth <= 3);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to_agent_key_id)
  WHERE assigned_to_agent_key_id IS NOT NULL;

CREATE INDEX idx_tasks_requested_by ON tasks(requested_by_agent_key_id)
  WHERE requested_by_agent_key_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Add can_assign permission to agent_permissions
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE agent_permissions
  ADD COLUMN can_assign boolean NOT NULL DEFAULT false;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Webhook subscriptions table
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key_id uuid NOT NULL REFERENCES agent_keys(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  event_types text[] NOT NULL DEFAULT '{task.completed}',
  url text NOT NULL,
  secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_subs_agent ON webhook_subscriptions(agent_key_id);
CREATE INDEX idx_webhook_subs_project ON webhook_subscriptions(project_id);
CREATE INDEX idx_webhook_subs_active ON webhook_subscriptions(project_id, is_active)
  WHERE is_active = true;

-- ══════════════════════════════════════════════════════════════════════
-- 5. Agent capabilities table (A2A Agent Card shaped)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE agent_capabilities (
  agent_key_id uuid PRIMARY KEY REFERENCES agent_keys(id) ON DELETE CASCADE,
  skills text[] NOT NULL DEFAULT '{}',
  description text,
  accepts_tasks boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
-- 6. Update get_tasks_page to include new columns + assignment filters
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_tasks_page(
  p_project_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_status status DEFAULT NULL,
  p_priority priority DEFAULT NULL,
  p_updated_after timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_requested_by uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  department_id uuid,
  priority priority,
  description text,
  notes text,
  due_date timestamptz,
  status status,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  created_by_type actor_type,
  created_by_id text,
  updated_by_type actor_type,
  updated_by_id text,
  source source,
  assigned_to_agent_key_id uuid,
  requested_by_agent_key_id uuid,
  delegation_depth integer,
  assignment_chain uuid[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.project_id, t.department_id, t.priority, t.description,
         t.notes, t.due_date, t.status, t.version, t.created_at, t.updated_at,
         t.created_by_type, t.created_by_id, t.updated_by_type, t.updated_by_id, t.source,
         t.assigned_to_agent_key_id, t.requested_by_agent_key_id,
         t.delegation_depth, t.assignment_chain
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_updated_after IS NULL OR t.updated_at > p_updated_after)
    AND (p_search IS NULL OR t.search_vector @@ websearch_to_tsquery('english', p_search))
    AND (p_assigned_to IS NULL OR t.assigned_to_agent_key_id = p_assigned_to)
    AND (p_requested_by IS NULL OR t.requested_by_agent_key_id = p_requested_by)
    AND (
      p_cursor_created_at IS NULL
      OR (t.created_at, t.id) > (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY t.created_at ASC, t.id ASC
  LIMIT LEAST(p_limit, 50);
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 7. Update create_task_with_event to support assignment fields
-- ══════════════════════════════════════════════════════════════════════
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
  v_assigned_to uuid;
  v_requested_by uuid;
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

  -- 3. Resolve assignment fields
  v_assigned_to := (p_payload->>'assigned_to_agent_key_id')::uuid;
  v_requested_by := (p_payload->>'requested_by_agent_key_id')::uuid;

  -- 4. Validate assigned agent exists and is active
  IF v_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM agent_keys WHERE id = v_assigned_to AND is_active = true) THEN
      RAISE EXCEPTION 'invalid_assignee:Assigned agent key does not exist or is inactive';
    END IF;
  END IF;

  -- 5. Insert task
  INSERT INTO tasks (
    project_id, department_id, priority, description, notes,
    due_date, status, version,
    created_by_type, created_by_id, updated_by_type, updated_by_id, source,
    assigned_to_agent_key_id, requested_by_agent_key_id,
    delegation_depth, assignment_chain
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
    (p_payload->>'source')::source,
    v_assigned_to,
    v_requested_by,
    0,
    '{}'
  )
  RETURNING * INTO v_task;

  -- 6. Insert event_log
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

  -- 7. Log assignment if task was assigned
  IF v_assigned_to IS NOT NULL THEN
    INSERT INTO event_log (
      event_category, target_type, target_id, event_type,
      field_name, new_value,
      actor_type, actor_id, actor_label, source
    ) VALUES (
      'task', 'task', v_task.id, 'task.assigned',
      'assigned_to_agent_key_id', to_jsonb(v_assigned_to::text),
      (p_payload->>'actor_type')::actor_type,
      p_payload->>'actor_id',
      p_payload->>'actor_label',
      (p_payload->>'source')::source
    );
  END IF;

  RETURN v_task;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. Update update_task_with_events to track assignment changes
-- ══════════════════════════════════════════════════════════════════════
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
  v_new_assignee uuid;
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

  -- 3. Delegation safety checks for reassignment
  IF v_updates ? 'assigned_to_agent_key_id' THEN
    v_new_assignee := (v_updates->>'assigned_to_agent_key_id')::uuid;

    IF v_new_assignee IS NOT NULL THEN
      -- Validate assignee exists and is active
      IF NOT EXISTS (SELECT 1 FROM agent_keys WHERE id = v_new_assignee AND is_active = true) THEN
        RAISE EXCEPTION 'invalid_assignee:Assigned agent key does not exist or is inactive';
      END IF;

      -- Prevent circular delegation: new assignee must not be in assignment_chain
      IF v_new_assignee = ANY(v_old.assignment_chain) THEN
        RAISE EXCEPTION 'circular_delegation:Agent has already been in the delegation chain for this task';
      END IF;

      -- Enforce delegation depth limit
      IF v_old.delegation_depth >= 3 THEN
        RAISE EXCEPTION 'delegation_depth_exceeded:Maximum delegation depth (3) reached';
      END IF;
    END IF;
  END IF;

  -- 4. Update task (only provided fields)
  UPDATE tasks SET
    priority      = COALESCE((v_updates->>'priority')::priority, priority),
    description   = COALESCE(v_updates->>'description', description),
    notes         = CASE WHEN v_updates ? 'notes' THEN v_updates->>'notes' ELSE notes END,
    department_id = CASE WHEN v_updates ? 'department_id' THEN (v_updates->>'department_id')::uuid ELSE department_id END,
    due_date      = CASE WHEN v_updates ? 'due_date' THEN (v_updates->>'due_date')::timestamptz ELSE due_date END,
    status        = COALESCE((v_updates->>'status')::status, status),
    assigned_to_agent_key_id = CASE
      WHEN v_updates ? 'assigned_to_agent_key_id' THEN (v_updates->>'assigned_to_agent_key_id')::uuid
      ELSE assigned_to_agent_key_id
    END,
    delegation_depth = CASE
      WHEN v_updates ? 'assigned_to_agent_key_id' AND (v_updates->>'assigned_to_agent_key_id')::uuid IS NOT NULL
        AND (v_updates->>'assigned_to_agent_key_id')::uuid IS DISTINCT FROM assigned_to_agent_key_id
      THEN delegation_depth + 1
      ELSE delegation_depth
    END,
    assignment_chain = CASE
      WHEN v_updates ? 'assigned_to_agent_key_id' AND (v_updates->>'assigned_to_agent_key_id')::uuid IS NOT NULL
        AND (v_updates->>'assigned_to_agent_key_id')::uuid IS DISTINCT FROM assigned_to_agent_key_id
        AND assigned_to_agent_key_id IS NOT NULL
      THEN array_append(assignment_chain, assigned_to_agent_key_id)
      ELSE assignment_chain
    END,
    version       = version + 1,
    updated_at    = now(),
    updated_by_type = v_actor_type,
    updated_by_id   = v_actor_id,
    source          = v_source
  WHERE id = v_task_id AND version = v_version
  RETURNING * INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'version_conflict:Task was modified concurrently';
  END IF;

  -- 5. Field-level diff using IS DISTINCT FROM, insert event_log rows
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

  IF v_new.assigned_to_agent_key_id IS DISTINCT FROM v_old.assigned_to_agent_key_id THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source)
    VALUES ('task', 'task', v_task_id, 'task.reassigned', 'assigned_to_agent_key_id',
      to_jsonb(v_old.assigned_to_agent_key_id::text), to_jsonb(v_new.assigned_to_agent_key_id::text),
      v_actor_type, v_actor_id, v_actor_label, v_source);
  END IF;

  RETURN v_new;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 9. Update update_agent_permissions to support can_assign
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_agent_permissions(p_key_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  -- Ensure caller is admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized:Only admins can update agent permissions';
  END IF;

  -- Delete existing permissions for this key
  DELETE FROM agent_permissions WHERE agent_key_id = p_key_id;

  -- Insert new permissions
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO agent_permissions (
      agent_key_id, project_id, department_id,
      can_read, can_create, can_update, can_assign
    ) VALUES (
      p_key_id,
      (v_row->>'project_id')::uuid,
      (v_row->>'department_id')::uuid,
      COALESCE((v_row->>'can_read')::boolean, false),
      COALESCE((v_row->>'can_create')::boolean, false),
      COALESCE((v_row->>'can_update')::boolean, false),
      COALESCE((v_row->>'can_assign')::boolean, false)
    );
  END LOOP;
END;
$$;
