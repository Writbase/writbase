-- Add tsvector column for full-text search
ALTER TABLE tasks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(description, '') || ' ' || coalesce(notes, ''))
  ) STORED;

CREATE INDEX idx_tasks_search ON tasks USING gin (search_vector);

-- Update get_tasks_page RPC to support full-text search
CREATE OR REPLACE FUNCTION get_tasks_page(
  p_project_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_status status DEFAULT NULL,
  p_priority priority DEFAULT NULL,
  p_updated_after timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_search text DEFAULT NULL
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
    AND (p_search IS NULL OR t.search_vector @@ websearch_to_tsquery('english', p_search))
  ORDER BY t.created_at ASC, t.id ASC
  LIMIT LEAST(p_limit, 50);
$$;
