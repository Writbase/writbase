-- Drop assignment columns and simplify task model
-- Replaces the overengineered delegation model (assigned_to, requested_by,
-- delegation_depth, assignment_chain) with a simpler assign_task tool approach.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Drop get_tasks_page (must DROP before removing columns it returns)
-- ══════════════════════════════════════════════════════════════════════
DROP FUNCTION get_tasks_page(uuid, uuid, uuid, status, priority, timestamptz, timestamptz, uuid, integer, text, uuid, uuid, boolean);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Drop assignment columns and related objects
-- ══════════════════════════════════════════════════════════════════════
-- Drop indexes first (if any reference assignment columns)
DROP INDEX IF EXISTS idx_tasks_assigned_to;
DROP INDEX IF EXISTS idx_tasks_requested_by;

-- Drop CHECK constraint on delegation_depth
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_delegation_depth_check;

-- Drop the columns
ALTER TABLE tasks
  DROP COLUMN assigned_to_agent_key_id,
  DROP COLUMN requested_by_agent_key_id,
  DROP COLUMN delegation_depth,
  DROP COLUMN assignment_chain;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Recreate get_tasks_page WITHOUT assignment params/columns
-- ══════════════════════════════════════════════════════════════════════
CREATE FUNCTION get_tasks_page(
  p_project_id uuid,
  p_workspace_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_status status DEFAULT NULL,
  p_priority priority DEFAULT NULL,
  p_updated_after timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_include_archived boolean DEFAULT false
)
RETURNS SETOF tasks
LANGUAGE sql
STABLE
AS $$
  SELECT t.*
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.workspace_id = p_workspace_id
    AND (p_include_archived OR t.is_archived = false)
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_updated_after IS NULL OR t.updated_at > p_updated_after)
    AND (
      p_cursor_created_at IS NULL
      OR (t.created_at, t.id) > (p_cursor_created_at, p_cursor_id)
    )
    AND (
      p_search IS NULL
      OR t.search_vector @@ websearch_to_tsquery('english', p_search)
    )
  ORDER BY t.created_at ASC, t.id ASC
  LIMIT LEAST(p_limit, 50);
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Recreate create_task_with_event WITHOUT assignment columns
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

  -- Insert task
  INSERT INTO tasks (
    project_id, department_id, priority, description, notes, due_date, status,
    created_by_type, created_by_id, updated_by_type, updated_by_id, source,
    workspace_id
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
    v_workspace_id
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
-- 5. Recreate update_task_with_events WITHOUT delegation logic
-- (note: section 4 above already recreated create_task_with_event)
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

  -- Update task (no delegation fields)
  UPDATE tasks SET
    priority = COALESCE((v_fields ->> 'priority')::priority, priority),
    description = COALESCE(v_fields ->> 'description', description),
    notes = CASE WHEN v_fields ? 'notes' THEN v_fields ->> 'notes' ELSE notes END,
    department_id = CASE WHEN v_fields ? 'department_id' THEN (v_fields ->> 'department_id')::uuid ELSE department_id END,
    due_date = CASE WHEN v_fields ? 'due_date' THEN (v_fields ->> 'due_date')::timestamptz ELSE due_date END,
    status = COALESCE((v_fields ->> 'status')::status, status),
    is_archived = CASE WHEN v_fields ? 'is_archived' THEN (v_fields->>'is_archived')::boolean ELSE is_archived END,
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

  RETURN v_new;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Recreate notify_webhook_subscribers WITHOUT assignment events
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_webhook_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events text[];
  v_payload jsonb;
  v_internal_secret text;
  v_edge_url text;
BEGIN
  -- 1. Derive webhook event types from OLD/NEW diff
  v_events := '{}';

  IF TG_OP = 'INSERT' THEN
    v_events := array_append(v_events, 'task.created');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_events := array_append(v_events, 'task.updated');
      IF NEW.status = 'done' THEN
        v_events := array_append(v_events, 'task.completed');
      ELSIF NEW.status = 'failed' THEN
        v_events := array_append(v_events, 'task.failed');
      END IF;
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      IF NOT ('task.updated' = ANY(v_events)) THEN
        v_events := array_append(v_events, 'task.updated');
      END IF;
    END IF;

    IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      v_events := array_append(v_events,
        CASE WHEN NEW.is_archived THEN 'task.archived' ELSE 'task.unarchived' END);
    END IF;
  END IF;

  -- 2. No events derived → nothing to do
  IF array_length(v_events, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Build payload for Edge Function
  v_payload := jsonb_build_object(
    'task_id', NEW.id,
    'project_id', NEW.project_id,
    'workspace_id', NEW.workspace_id,
    'version', NEW.version,
    'events', to_jsonb(v_events),
    'new_record', to_jsonb(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  -- 4. Get config: prefer Vault (hosted), fall back to GUC (local dev)
  BEGIN
    SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets WHERE name = 'webhook_internal_secret' LIMIT 1;
    SELECT decrypted_secret INTO v_edge_url
      FROM vault.decrypted_secrets WHERE name = 'edge_function_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault not available (local dev)
    NULL;
  END;
  v_internal_secret := COALESCE(v_internal_secret,
    current_setting('app.settings.webhook_internal_secret', true));
  v_edge_url := COALESCE(v_edge_url,
    current_setting('app.settings.edge_function_url', true));

  -- 5. Call Edge Function via pg_net (fires after commit)
  IF v_edge_url IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_edge_url || '/webhook-deliver',
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Webhook-Internal-Secret', COALESCE(v_internal_secret, '')
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- pg_net not available — log and continue (task mutation must not fail)
      RAISE NOTICE 'webhook delivery skipped: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 7. Update check_workspace_consistency — remove assignee check
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_workspace_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'agent_permissions' THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: project % not in workspace %', NEW.project_id, NEW.workspace_id;
    END IF;
    IF NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: department % not in workspace %', NEW.department_id, NEW.workspace_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'tasks' THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: project % not in workspace %', NEW.project_id, NEW.workspace_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'webhook_subscriptions' THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: project % not in workspace %', NEW.project_id, NEW.workspace_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'agent_keys' THEN
    IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: project % not in workspace %', NEW.project_id, NEW.workspace_id;
    END IF;
    IF NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: department % not in workspace %', NEW.department_id, NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. Force PostgREST schema cache reload
-- ══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
