-- Atomic permission update: delete + insert in a single transaction
-- Prevents race condition where agent has zero permissions between
-- separate DELETE and INSERT calls.
CREATE OR REPLACE FUNCTION update_agent_permissions(
  p_key_id uuid,
  p_rows jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM agent_permissions WHERE agent_key_id = p_key_id;

  INSERT INTO agent_permissions (agent_key_id, project_id, department_id, can_read, can_create, can_update)
  SELECT p_key_id,
         (r->>'project_id')::uuid,
         (r->>'department_id')::uuid,
         (r->>'can_read')::boolean,
         (r->>'can_create')::boolean,
         (r->>'can_update')::boolean
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;
