-- Fix get_top_tasks: exclude non-actionable statuses (done, cancelled, failed, blocked) by default.
-- When p_status is explicitly set, filter to that exact status (including non-actionable ones).

CREATE OR REPLACE FUNCTION get_top_tasks(
  p_workspace_id uuid, p_project_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10
) RETURNS SETOF tasks LANGUAGE sql STABLE AS $$
  SELECT * FROM tasks
  WHERE workspace_id = p_workspace_id
    AND project_id = p_project_id
    AND is_archived = false
    AND (p_department_id IS NULL OR department_id = p_department_id)
    AND (p_status IS NOT NULL AND status = p_status::status
         OR p_status IS NULL AND status NOT IN ('done', 'cancelled', 'failed', 'blocked'))
  ORDER BY priority DESC, created_at ASC
  LIMIT LEAST(p_limit, 25);
$$;
