-- Task archiving support
-- 1. Add is_archived column to tasks with partial index
-- 2. Add can_archive permission to agent_permissions
-- 3. Recreate get_tasks_page with is_archived support (new return type requires DROP)
-- 4. Update update_task_with_events to handle is_archived field + event logging
-- 5. Update notify_webhook_subscribers trigger for archive events
-- 6. Update update_agent_permissions RPC to include can_archive

-- ══════════════════════════════════════════════════════════════════════
-- 1. Add is_archived column to tasks
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE tasks ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
CREATE INDEX tasks_not_archived_idx ON tasks (workspace_id, project_id)
  WHERE is_archived = false;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Add can_archive permission
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE agent_permissions ADD COLUMN can_archive boolean NOT NULL DEFAULT false;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Recreate get_tasks_page with is_archived support
-- ══════════════════════════════════════════════════════════════════════
DROP FUNCTION get_tasks_page(uuid, uuid, uuid, status, priority, timestamptz, timestamptz, uuid, integer, text, uuid, uuid);

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
  p_assigned_to uuid DEFAULT NULL,
  p_requested_by uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT false
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
  assignment_chain uuid[],
  is_archived boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.id, t.project_id, t.department_id, t.priority, t.description, t.notes,
    t.due_date, t.status, t.version, t.created_at, t.updated_at,
    t.created_by_type, t.created_by_id, t.updated_by_type, t.updated_by_id, t.source,
    t.assigned_to_agent_key_id, t.requested_by_agent_key_id,
    t.delegation_depth, t.assignment_chain, t.is_archived
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.workspace_id = p_workspace_id
    AND (p_include_archived OR t.is_archived = false)
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_updated_after IS NULL OR t.updated_at > p_updated_after)
    AND (p_assigned_to IS NULL OR t.assigned_to_agent_key_id = p_assigned_to)
    AND (p_requested_by IS NULL OR t.requested_by_agent_key_id = p_requested_by)
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
-- 4. Update update_task_with_events to handle is_archived
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
  v_new_assigned_to uuid;
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

  -- Delegation safety checks (if reassigning)
  IF v_fields ? 'assigned_to_agent_key_id' THEN
    v_new_assigned_to := (v_fields ->> 'assigned_to_agent_key_id')::uuid;
    IF v_new_assigned_to IS NOT NULL THEN
      -- Validate assignee exists, is active, and in same workspace
      IF NOT EXISTS (SELECT 1 FROM agent_keys WHERE id = v_new_assigned_to AND is_active AND workspace_id = v_old.workspace_id) THEN
        RAISE EXCEPTION 'invalid_assignee:Assignee not found or inactive';
      END IF;
      -- Circular delegation check
      IF v_new_assigned_to = ANY(v_old.assignment_chain) THEN
        RAISE EXCEPTION 'circular_delegation:Assignee already in delegation chain';
      END IF;
      -- Depth check
      IF v_old.delegation_depth >= 3 THEN
        RAISE EXCEPTION 'delegation_depth_exceeded:Maximum delegation depth (3) reached';
      END IF;
    END IF;
  END IF;

  -- Update task
  UPDATE tasks SET
    priority = COALESCE((v_fields ->> 'priority')::priority, priority),
    description = COALESCE(v_fields ->> 'description', description),
    notes = CASE WHEN v_fields ? 'notes' THEN v_fields ->> 'notes' ELSE notes END,
    department_id = CASE WHEN v_fields ? 'department_id' THEN (v_fields ->> 'department_id')::uuid ELSE department_id END,
    due_date = CASE WHEN v_fields ? 'due_date' THEN (v_fields ->> 'due_date')::timestamptz ELSE due_date END,
    status = COALESCE((v_fields ->> 'status')::status, status),
    assigned_to_agent_key_id = CASE WHEN v_fields ? 'assigned_to_agent_key_id' THEN (v_fields ->> 'assigned_to_agent_key_id')::uuid ELSE assigned_to_agent_key_id END,
    delegation_depth = CASE
      WHEN v_fields ? 'assigned_to_agent_key_id' AND (v_fields ->> 'assigned_to_agent_key_id')::uuid IS DISTINCT FROM assigned_to_agent_key_id
      THEN delegation_depth + 1
      ELSE delegation_depth
    END,
    assignment_chain = CASE
      WHEN v_fields ? 'assigned_to_agent_key_id' AND (v_fields ->> 'assigned_to_agent_key_id')::uuid IS DISTINCT FROM assigned_to_agent_key_id AND assigned_to_agent_key_id IS NOT NULL
      THEN assignment_chain || assigned_to_agent_key_id
      ELSE assignment_chain
    END,
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

  IF v_old.assigned_to_agent_key_id IS DISTINCT FROM v_new.assigned_to_agent_key_id THEN
    INSERT INTO event_log (event_category, target_type, target_id, event_type, field_name, old_value, new_value, actor_type, actor_id, actor_label, source, workspace_id)
    VALUES ('task', 'task', v_task_id, 'task.reassigned', 'assigned_to_agent_key_id', to_jsonb(v_old.assigned_to_agent_key_id::text), to_jsonb(v_new.assigned_to_agent_key_id::text), (p_payload ->> 'actor_type')::actor_type, p_payload ->> 'actor_id', p_payload ->> 'actor_label', (p_payload ->> 'source')::source, v_old.workspace_id);
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
-- 5. Update notify_webhook_subscribers trigger for archive events
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
    IF NEW.assigned_to_agent_key_id IS NOT NULL THEN
      v_events := array_append(v_events, 'task.assigned');
    END IF;
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

    IF NEW.assigned_to_agent_key_id IS DISTINCT FROM OLD.assigned_to_agent_key_id THEN
      IF OLD.assigned_to_agent_key_id IS NULL THEN
        v_events := array_append(v_events, 'task.assigned');
      ELSE
        v_events := array_append(v_events, 'task.reassigned');
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
-- 6. Update update_agent_permissions RPC to include can_archive
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_agent_permissions(p_key_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_row jsonb;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM agent_keys WHERE id = p_key_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: agent key not found';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = v_workspace_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;
  END IF;

  DELETE FROM agent_permissions WHERE agent_key_id = p_key_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO agent_permissions (
      agent_key_id, project_id, department_id,
      can_read, can_create, can_update, can_assign, can_comment, can_archive,
      workspace_id
    ) VALUES (
      p_key_id,
      (v_row ->> 'project_id')::uuid,
      (v_row ->> 'department_id')::uuid,
      COALESCE((v_row ->> 'can_read')::boolean, false),
      COALESCE((v_row ->> 'can_create')::boolean, false),
      COALESCE((v_row ->> 'can_update')::boolean, false),
      COALESCE((v_row ->> 'can_assign')::boolean, false),
      COALESCE((v_row ->> 'can_comment')::boolean, false),
      COALESCE((v_row ->> 'can_archive')::boolean, false),
      v_workspace_id
    );
  END LOOP;
END;
$$;
