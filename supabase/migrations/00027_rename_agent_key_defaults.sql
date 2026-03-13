-- Rename default_project_id/default_department_id to project_id/department_id
-- These aren't "defaults" — they're the agent's home project/department.

ALTER TABLE agent_keys RENAME COLUMN default_project_id TO project_id;
ALTER TABLE agent_keys RENAME COLUMN default_department_id TO department_id;

-- Rename the CHECK constraint
ALTER TABLE agent_keys DROP CONSTRAINT agent_keys_default_dept_requires_project;
ALTER TABLE agent_keys ADD CONSTRAINT agent_keys_dept_requires_project
  CHECK (department_id IS NULL OR project_id IS NOT NULL);

-- Recreate trigger function with updated column names
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
    IF NEW.assigned_to_agent_key_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent_keys WHERE id = NEW.assigned_to_agent_key_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: assignee % not in workspace %', NEW.assigned_to_agent_key_id, NEW.workspace_id;
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
