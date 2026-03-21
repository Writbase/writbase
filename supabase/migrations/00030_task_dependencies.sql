-- Task Dependencies (DAG): junction table, cycle detection, dependency RPC.
-- Enables blocked_by/blocks relationships between tasks with database-level
-- cycle prevention via recursive CTE.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Junction table for blocked_by edges
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_type actor_type NOT NULL,
  created_by_id text NOT NULL,
  CONSTRAINT no_self_dependency CHECK (task_id != blocked_by_task_id),
  UNIQUE (task_id, blocked_by_task_id)
);

CREATE INDEX idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX idx_task_deps_blocked_by ON task_dependencies(blocked_by_task_id);
CREATE INDEX idx_task_deps_workspace ON task_dependencies(workspace_id);

-- RLS: workspace-scoped reads
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_deps_workspace_read ON task_dependencies
  FOR SELECT USING (
    workspace_id IN (SELECT get_user_workspace_ids())
  );

-- Service role bypasses RLS; MCP filters by ctx.workspaceId (defense-in-depth)

-- ══════════════════════════════════════════════════════════════════════
-- 2. Cycle detection function
-- ══════════════════════════════════════════════════════════════════════
CREATE FUNCTION check_dependency_cycle(
  p_task_id uuid,
  p_blocked_by_task_id uuid
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  -- Returns TRUE if adding edge (p_task_id blocked_by p_blocked_by_task_id)
  -- would create a cycle. Walks existing blocked_by edges from the proposed
  -- blocker to see if p_task_id is reachable (which would close a loop).
  WITH RECURSIVE reachable AS (
    SELECT blocked_by_task_id AS ancestor
    FROM task_dependencies
    WHERE task_id = p_blocked_by_task_id

    UNION

    SELECT td.blocked_by_task_id
    FROM task_dependencies td
    JOIN reachable r ON td.task_id = r.ancestor
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE ancestor = p_task_id
  );
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. set_task_dependencies RPC (atomic add/remove + cycle check + event log)
-- ══════════════════════════════════════════════════════════════════════
CREATE FUNCTION set_task_dependencies(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_task tasks;
  v_version int;
  v_add_ids uuid[];
  v_remove_ids uuid[];
  v_dep_id uuid;
  v_workspace_id uuid;
  v_actor_type actor_type;
  v_actor_id text;
  v_actor_label text;
  v_source source;
  v_blocker tasks;
BEGIN
  v_task_id := (p_payload ->> 'task_id')::uuid;
  v_version := (p_payload ->> 'version')::int;
  v_actor_type := (p_payload ->> 'actor_type')::actor_type;
  v_actor_id := p_payload ->> 'actor_id';
  v_actor_label := p_payload ->> 'actor_label';
  v_source := (p_payload ->> 'source')::source;

  -- 1. Lock and fetch the task
  SELECT * INTO v_task FROM tasks WHERE id = v_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found:Task not found';
  END IF;

  -- 2. Version check
  IF v_task.version != v_version THEN
    RAISE EXCEPTION 'version_conflict:Expected version %, found %', v_version, v_task.version;
  END IF;

  v_workspace_id := v_task.workspace_id;

  -- 3. Parse add/remove arrays
  SELECT COALESCE(array_agg(x::uuid), '{}')
    INTO v_add_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload -> 'add_blocked_by', '[]'::jsonb)) x;

  SELECT COALESCE(array_agg(x::uuid), '{}')
    INTO v_remove_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload -> 'remove_blocked_by', '[]'::jsonb)) x;

  -- 4. Process removals
  DELETE FROM task_dependencies
    WHERE task_id = v_task_id
      AND blocked_by_task_id = ANY(v_remove_ids);

  -- Log removal events
  FOREACH v_dep_id IN ARRAY v_remove_ids LOOP
    INSERT INTO event_log (
      event_category, target_type, target_id, event_type,
      field_name, old_value,
      actor_type, actor_id, actor_label, source, workspace_id
    ) VALUES (
      'task', 'task', v_task_id, 'task.dependency_removed',
      'blocked_by', to_jsonb(v_dep_id::text),
      v_actor_type, v_actor_id, v_actor_label, v_source, v_workspace_id
    );
  END LOOP;

  -- 5. Process additions (with validation + cycle check)
  FOREACH v_dep_id IN ARRAY v_add_ids LOOP
    -- Validate blocker task exists and is in same workspace
    SELECT * INTO v_blocker FROM tasks WHERE id = v_dep_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dependency_not_found:Blocking task % not found', v_dep_id;
    END IF;
    IF v_blocker.workspace_id != v_workspace_id THEN
      RAISE EXCEPTION 'dependency_cross_workspace:Blocking task must be in the same workspace';
    END IF;

    -- Cycle check
    IF check_dependency_cycle(v_task_id, v_dep_id) THEN
      RAISE EXCEPTION 'dependency_cycle:Adding dependency on % would create a cycle', v_dep_id;
    END IF;

    -- Insert (ignore duplicates)
    INSERT INTO task_dependencies (task_id, blocked_by_task_id, workspace_id, created_by_type, created_by_id)
    VALUES (v_task_id, v_dep_id, v_workspace_id, v_actor_type, v_actor_id)
    ON CONFLICT (task_id, blocked_by_task_id) DO NOTHING;

    -- Log addition event
    INSERT INTO event_log (
      event_category, target_type, target_id, event_type,
      field_name, new_value,
      actor_type, actor_id, actor_label, source, workspace_id
    ) VALUES (
      'task', 'task', v_task_id, 'task.dependency_added',
      'blocked_by', to_jsonb(v_dep_id::text),
      v_actor_type, v_actor_id, v_actor_label, v_source, v_workspace_id
    );
  END LOOP;

  -- 6. Bump version + update timestamp
  UPDATE tasks SET
    version = version + 1,
    updated_at = now(),
    updated_by_type = v_actor_type,
    updated_by_id = v_actor_id,
    source = v_source
  WHERE id = v_task_id
  RETURNING version INTO v_version;

  -- 7. Return current deps
  RETURN jsonb_build_object(
    'task_id', v_task_id,
    'version', v_version,
    'blocked_by', COALESCE(
      (SELECT jsonb_agg(blocked_by_task_id) FROM task_dependencies WHERE task_id = v_task_id),
      '[]'::jsonb
    )
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Update get_tasks_page to include blocked_by computed column
-- ══════════════════════════════════════════════════════════════════════
DROP FUNCTION get_tasks_page(uuid, uuid, uuid, status, priority, timestamptz, timestamptz, uuid, integer, text, boolean);

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
  search_vector tsvector,
  workspace_id uuid,
  is_archived boolean,
  session_id text,
  blocked_by uuid[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.id, t.project_id, t.department_id, t.priority, t.description,
    t.notes, t.due_date, t.status, t.version, t.created_at, t.updated_at,
    t.created_by_type, t.created_by_id, t.updated_by_type, t.updated_by_id,
    t.source, t.search_vector, t.workspace_id, t.is_archived, t.session_id,
    COALESCE(
      (SELECT array_agg(td.blocked_by_task_id)
       FROM task_dependencies td
       WHERE td.task_id = t.id),
      '{}'
    ) AS blocked_by
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
-- 5. Extend create_task_with_event to accept blocked_by for atomic creation
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
  v_blocked_by uuid[];
  v_dep_id uuid;
  v_blocker tasks;
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

  -- Atomically create blocked_by edges if provided
  SELECT COALESCE(array_agg(x::uuid), '{}')
    INTO v_blocked_by
    FROM jsonb_array_elements_text(COALESCE(p_payload -> 'blocked_by', '[]'::jsonb)) x;

  FOREACH v_dep_id IN ARRAY v_blocked_by LOOP
    -- Validate blocker exists and is in same workspace
    SELECT * INTO v_blocker FROM tasks WHERE id = v_dep_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dependency_not_found:Blocking task % not found', v_dep_id;
    END IF;
    IF v_blocker.workspace_id != v_workspace_id THEN
      RAISE EXCEPTION 'dependency_cross_workspace:Blocking task must be in the same workspace';
    END IF;

    -- No cycle check needed for new tasks (they have no incoming edges yet)

    INSERT INTO task_dependencies (task_id, blocked_by_task_id, workspace_id, created_by_type, created_by_id)
    VALUES (v_task.id, v_dep_id, v_workspace_id, (p_payload ->> 'created_by_type')::actor_type, p_payload ->> 'created_by_id');

    INSERT INTO event_log (
      event_category, target_type, target_id, event_type,
      field_name, new_value,
      actor_type, actor_id, actor_label, source, workspace_id
    ) VALUES (
      'task', 'task', v_task.id, 'task.dependency_added',
      'blocked_by', to_jsonb(v_dep_id::text),
      (p_payload ->> 'actor_type')::actor_type,
      p_payload ->> 'actor_id',
      p_payload ->> 'actor_label',
      (p_payload ->> 'source')::source,
      v_workspace_id
    );
  END LOOP;

  RETURN v_task;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Force PostgREST schema cache reload
-- ══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
