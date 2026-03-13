-- Agent key stored defaults: default_project_id, default_department_id
-- Pre-fill MCP schema params so agents don't need to specify project/dept every call.

ALTER TABLE agent_keys
  ADD COLUMN default_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN default_department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

-- Dept default requires project default to also be set
ALTER TABLE agent_keys ADD CONSTRAINT agent_keys_default_dept_requires_project
  CHECK (default_department_id IS NULL OR default_project_id IS NOT NULL);

-- Extend check_workspace_consistency to validate agent_keys defaults
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
    IF NEW.default_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.default_project_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: default project % not in workspace %', NEW.default_project_id, NEW.workspace_id;
    END IF;
    IF NEW.default_department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.default_department_id AND workspace_id = NEW.workspace_id) THEN
      RAISE EXCEPTION 'cross-workspace reference: default department % not in workspace %', NEW.default_department_id, NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_agent_keys_workspace_consistency
  BEFORE INSERT OR UPDATE ON agent_keys
  FOR EACH ROW EXECUTE FUNCTION check_workspace_consistency();
