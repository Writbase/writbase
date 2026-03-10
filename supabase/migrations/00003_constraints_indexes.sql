-- Task indexes
CREATE INDEX idx_tasks_project_dept_status ON tasks(project_id, department_id, status);
CREATE INDEX idx_tasks_project_created_id ON tasks(project_id, created_at, id);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);

-- Event log indexes
CREATE INDEX idx_event_log_target ON event_log(target_id, event_category);
CREATE INDEX idx_event_log_created_at ON event_log(created_at);

-- Agent permissions index
CREATE INDEX idx_agent_permissions_key ON agent_permissions(agent_key_id);

-- Rate limits index
CREATE INDEX idx_rate_limits_key_window ON rate_limits(agent_key_id, window_start);

-- Description min length check
ALTER TABLE tasks ADD CONSTRAINT chk_description_min_length CHECK (char_length(description) >= 3);

-- Revoke mutation on event_log for non-service roles
REVOKE UPDATE, DELETE ON event_log FROM anon, authenticated;

-- Cursor pagination RPC
CREATE OR REPLACE FUNCTION get_tasks_page(
  p_project_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_status status DEFAULT NULL,
  p_priority priority DEFAULT NULL,
  p_updated_after timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
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
  source source
)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.project_id, t.department_id, t.priority, t.description,
         t.notes, t.due_date, t.status, t.version, t.created_at, t.updated_at,
         t.created_by_type, t.created_by_id, t.updated_by_type, t.updated_by_id, t.source
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_updated_after IS NULL OR t.updated_at > p_updated_after)
    AND (
      p_cursor_created_at IS NULL
      OR (t.created_at, t.id) > (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY t.created_at ASC, t.id ASC
  LIMIT LEAST(p_limit, 50);
$$;
