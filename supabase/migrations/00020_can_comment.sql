-- Add can_comment column to agent_permissions
ALTER TABLE agent_permissions ADD COLUMN can_comment boolean NOT NULL DEFAULT false;

-- Update the RPC function to handle can_comment
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
      can_read, can_create, can_update, can_assign, can_comment,
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
      v_workspace_id
    );
  END LOOP;
END;
$$;
