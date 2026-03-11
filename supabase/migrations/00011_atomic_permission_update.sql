-- Atomic permission update: delete + insert in a single transaction
-- Prevents race condition where agent has zero permissions between
-- separate DELETE and INSERT calls.
CREATE OR REPLACE FUNCTION update_agent_permissions(
  p_key_id uuid,
  p_rows jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Enforce admin-only access (defense-in-depth alongside GRANT restrictions)
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

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

-- Restrict execution: revoke from public/anon, allow only authenticated users
REVOKE ALL ON FUNCTION update_agent_permissions(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_agent_permissions(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION update_agent_permissions(uuid, jsonb) TO authenticated;
