-- ============================================================================
-- Migration 00019: Replace admin_users with multi-tenant workspaces
-- ============================================================================
-- Replaces the flat admin_users gate with workspace-scoped isolation.
-- Signup auto-creates a workspace via Postgres trigger. No manual bootstrap.
-- ============================================================================

-- ── 1a. New tables ─────────────────────────────────────────────────────

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Workspace',
  slug text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slug),
  UNIQUE(owner_id)  -- MVP: one workspace per user
);

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- ── 1b. Bootstrap workspace for existing data ─────────────────────────

DO $$
DECLARE v_ws_id uuid;
DECLARE v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM admin_users LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO workspaces (name, slug, owner_id)
      VALUES ('My Workspace', 'ws-' || substr(md5(v_user_id::text), 1, 8), v_user_id)
      RETURNING id INTO v_ws_id;
    INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (v_ws_id, v_user_id, 'owner');
    INSERT INTO workspace_members (workspace_id, user_id, role)
      SELECT v_ws_id, user_id, 'member'
      FROM admin_users WHERE user_id != v_user_id;
  ELSE
    -- Fresh DB: delete orphan seed data so NOT NULL succeeds on empty tables
    DELETE FROM app_settings;
  END IF;
END $$;

-- ── 1c. Add workspace_id to all data tables ───────────────────────────

-- Step 1: Add as nullable
ALTER TABLE projects ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE departments ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE tasks ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE event_log ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE agent_keys ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE agent_permissions ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE app_settings ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE webhook_subscriptions ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE agent_capabilities ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE request_log ADD COLUMN workspace_id uuid REFERENCES workspaces(id);

-- Step 2: Backfill from bootstrap workspace (no-op on fresh DB)
UPDATE projects SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE departments SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE tasks SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE event_log SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE agent_keys SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE agent_permissions SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE app_settings SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE webhook_subscriptions SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE agent_capabilities SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE request_log SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;

-- Step 3: Set NOT NULL
ALTER TABLE projects ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE departments ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE event_log ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE agent_keys ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE agent_permissions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE app_settings ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE webhook_subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE agent_capabilities ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE request_log ALTER COLUMN workspace_id SET NOT NULL;

-- Indexes
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_departments_workspace ON departments(workspace_id);
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_event_log_workspace ON event_log(workspace_id);
CREATE INDEX idx_agent_keys_workspace ON agent_keys(workspace_id);
CREATE INDEX idx_agent_permissions_workspace ON agent_permissions(workspace_id);
CREATE INDEX idx_app_settings_workspace ON app_settings(workspace_id);
CREATE INDEX idx_webhook_subscriptions_workspace ON webhook_subscriptions(workspace_id);
CREATE INDEX idx_agent_capabilities_workspace ON agent_capabilities(workspace_id);
CREATE INDEX idx_request_log_workspace ON request_log(workspace_id);

-- ── 1d. Replace global unique constraints with workspace-scoped ───────

ALTER TABLE projects DROP CONSTRAINT projects_name_key;
ALTER TABLE projects DROP CONSTRAINT projects_slug_key;
ALTER TABLE departments DROP CONSTRAINT departments_name_key;
ALTER TABLE departments DROP CONSTRAINT departments_slug_key;

ALTER TABLE projects ADD CONSTRAINT uq_projects_ws_name UNIQUE (workspace_id, name);
ALTER TABLE projects ADD CONSTRAINT uq_projects_ws_slug UNIQUE (workspace_id, slug);
ALTER TABLE departments ADD CONSTRAINT uq_departments_ws_name UNIQUE (workspace_id, name);
ALTER TABLE departments ADD CONSTRAINT uq_departments_ws_slug UNIQUE (workspace_id, slug);

-- app_settings: one row per workspace
ALTER TABLE app_settings ADD CONSTRAINT uq_app_settings_ws UNIQUE (workspace_id);

-- ── 1e. RLS helper function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = auth.uid();
$$;

-- ── 1f. RLS on new tables ─────────────────────────────────────────────

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_select" ON workspaces FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "owner_update" ON workspaces FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "member_select" ON workspace_members FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "owner_insert_members" ON workspace_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = (SELECT auth.uid())));
CREATE POLICY "owner_update_members" ON workspace_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = (SELECT auth.uid())));
CREATE POLICY "owner_delete_members" ON workspace_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = (SELECT auth.uid())));

-- ── 1g. Drop ALL old RLS policies ────────────────────────────────────

-- projects (4)
DROP POLICY "admin_select_projects" ON projects;
DROP POLICY "admin_insert_projects" ON projects;
DROP POLICY "admin_update_projects" ON projects;
DROP POLICY "admin_delete_projects" ON projects;

-- departments (4)
DROP POLICY "admin_select_departments" ON departments;
DROP POLICY "admin_insert_departments" ON departments;
DROP POLICY "admin_update_departments" ON departments;
DROP POLICY "admin_delete_departments" ON departments;

-- tasks (4)
DROP POLICY "admin_select_tasks" ON tasks;
DROP POLICY "admin_insert_tasks" ON tasks;
DROP POLICY "admin_update_tasks" ON tasks;
DROP POLICY "admin_delete_tasks" ON tasks;

-- agent_keys (4)
DROP POLICY "admin_select_agent_keys" ON agent_keys;
DROP POLICY "admin_insert_agent_keys" ON agent_keys;
DROP POLICY "admin_update_agent_keys" ON agent_keys;
DROP POLICY "admin_delete_agent_keys" ON agent_keys;

-- agent_permissions (4)
DROP POLICY "admin_select_agent_permissions" ON agent_permissions;
DROP POLICY "admin_insert_agent_permissions" ON agent_permissions;
DROP POLICY "admin_update_agent_permissions" ON agent_permissions;
DROP POLICY "admin_delete_agent_permissions" ON agent_permissions;

-- app_settings (4)
DROP POLICY "admin_select_app_settings" ON app_settings;
DROP POLICY "admin_insert_app_settings" ON app_settings;
DROP POLICY "admin_update_app_settings" ON app_settings;
DROP POLICY "admin_delete_app_settings" ON app_settings;

-- event_log (1)
DROP POLICY "admin_select_event_log" ON event_log;

-- admin_users (4) — drop before table drop
DROP POLICY "authenticated_select_admin_users" ON admin_users;
DROP POLICY "admin_insert_admin_users" ON admin_users;
DROP POLICY "admin_update_admin_users" ON admin_users;
DROP POLICY "admin_delete_admin_users" ON admin_users;

-- request_log (1)
DROP POLICY "admin_select_request_log" ON request_log;

-- ── 1h. Recreate RLS policies with workspace scoping ─────────────────

-- projects
CREATE POLICY "ws_select_projects" ON projects FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_projects" ON projects FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_projects" ON projects FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_projects" ON projects FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- departments
CREATE POLICY "ws_select_departments" ON departments FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_departments" ON departments FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_departments" ON departments FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_departments" ON departments FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- tasks
CREATE POLICY "ws_select_tasks" ON tasks FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_tasks" ON tasks FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_tasks" ON tasks FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_tasks" ON tasks FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- agent_keys
CREATE POLICY "ws_select_agent_keys" ON agent_keys FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_agent_keys" ON agent_keys FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_agent_keys" ON agent_keys FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_agent_keys" ON agent_keys FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- agent_permissions
CREATE POLICY "ws_select_agent_permissions" ON agent_permissions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_agent_permissions" ON agent_permissions FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_agent_permissions" ON agent_permissions FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_agent_permissions" ON agent_permissions FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- app_settings (SELECT + UPDATE only — created by trigger)
CREATE POLICY "ws_select_app_settings" ON app_settings FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_app_settings" ON app_settings FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- event_log (SELECT only — append-only, INSERT via service_role)
CREATE POLICY "ws_select_event_log" ON event_log FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- request_log (SELECT only)
CREATE POLICY "ws_select_request_log" ON request_log FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- webhook_subscriptions (new RLS)
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_select_webhook_subscriptions" ON webhook_subscriptions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_webhook_subscriptions" ON webhook_subscriptions FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_webhook_subscriptions" ON webhook_subscriptions FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_webhook_subscriptions" ON webhook_subscriptions FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- agent_capabilities (new RLS)
ALTER TABLE agent_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_select_agent_capabilities" ON agent_capabilities FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_insert_agent_capabilities" ON agent_capabilities FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_update_agent_capabilities" ON agent_capabilities FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));
CREATE POLICY "ws_delete_agent_capabilities" ON agent_capabilities FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ── 1i. Workspace_id immutability trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION prevent_workspace_reassignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id != OLD.workspace_id THEN
    RAISE EXCEPTION 'workspace_id cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON agent_keys
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON agent_permissions
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();
CREATE TRIGGER immutable_workspace_id BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_reassignment();

-- ── 1j. Cross-workspace integrity triggers ────────────────────────────

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

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_consistency BEFORE INSERT OR UPDATE ON agent_permissions
  FOR EACH ROW EXECUTE FUNCTION check_workspace_consistency();
CREATE TRIGGER enforce_workspace_consistency BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION check_workspace_consistency();
CREATE TRIGGER enforce_workspace_consistency BEFORE INSERT OR UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION check_workspace_consistency();

-- ── 1k. Update RPCs ──────────────────────────────────────────────────

-- update_agent_permissions: replace admin_users check with workspace membership
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
  -- Look up workspace from agent key
  SELECT workspace_id INTO v_workspace_id FROM agent_keys WHERE id = p_key_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: agent key not found';
  END IF;

  -- Check caller belongs to workspace (auth.uid() is NULL for service_role calls)
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = v_workspace_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;
  END IF;

  -- Atomic delete + insert
  DELETE FROM agent_permissions WHERE agent_key_id = p_key_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO agent_permissions (
      agent_key_id, project_id, department_id,
      can_read, can_create, can_update, can_assign,
      workspace_id
    ) VALUES (
      p_key_id,
      (v_row ->> 'project_id')::uuid,
      (v_row ->> 'department_id')::uuid,
      COALESCE((v_row ->> 'can_read')::boolean, false),
      COALESCE((v_row ->> 'can_create')::boolean, false),
      COALESCE((v_row ->> 'can_update')::boolean, false),
      COALESCE((v_row ->> 'can_assign')::boolean, false),
      v_workspace_id
    );
  END LOOP;
END;
$$;

-- create_task_with_event: add workspace_id support
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
  v_assigned_to uuid;
  v_requested_by uuid;
  v_workspace_id uuid;
BEGIN
  v_project_id := (p_payload ->> 'project_id')::uuid;
  v_department_id := (p_payload ->> 'department_id')::uuid;
  v_assigned_to := (p_payload ->> 'assigned_to_agent_key_id')::uuid;
  v_requested_by := (p_payload ->> 'requested_by_agent_key_id')::uuid;
  v_workspace_id := (p_payload ->> 'workspace_id')::uuid;

  -- Validate workspace_id is provided
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_required:workspace_id is required';
  END IF;

  -- Validate project exists, not archived, and belongs to workspace
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = v_project_id AND NOT is_archived AND workspace_id = v_workspace_id) THEN
    -- Check if project exists at all
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

  -- Validate assignee if provided
  IF v_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM agent_keys WHERE id = v_assigned_to AND is_active AND workspace_id = v_workspace_id) THEN
      RAISE EXCEPTION 'invalid_assignee:Assignee not found or inactive';
    END IF;
  END IF;

  -- Insert task
  INSERT INTO tasks (
    project_id, department_id, priority, description, notes, due_date, status,
    created_by_type, created_by_id, updated_by_type, updated_by_id, source,
    assigned_to_agent_key_id, requested_by_agent_key_id,
    delegation_depth, assignment_chain, workspace_id
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
    v_assigned_to,
    v_requested_by,
    0,
    '{}',
    v_workspace_id
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

  -- Log task.assigned event if assigned
  IF v_assigned_to IS NOT NULL THEN
    INSERT INTO event_log (
      event_category, target_type, target_id, event_type,
      field_name, new_value,
      actor_type, actor_id, actor_label, source, workspace_id
    ) VALUES (
      'task', 'task', v_task.id, 'task.assigned',
      'assigned_to_agent_key_id', to_jsonb(v_assigned_to::text),
      (p_payload ->> 'actor_type')::actor_type,
      p_payload ->> 'actor_id',
      p_payload ->> 'actor_label',
      (p_payload ->> 'source')::source,
      v_workspace_id
    );
  END IF;

  RETURN v_task;
END;
$$;

-- update_task_with_events: add workspace_id to event_log inserts
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

  RETURN v_new;
END;
$$;

-- get_tasks_page: add workspace_id parameter
CREATE OR REPLACE FUNCTION get_tasks_page(
  p_project_id uuid,
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
  p_workspace_id uuid
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
  assignment_chain uuid[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.id, t.project_id, t.department_id, t.priority, t.description, t.notes,
    t.due_date, t.status, t.version, t.created_at, t.updated_at,
    t.created_by_type, t.created_by_id, t.updated_by_type, t.updated_by_id, t.source,
    t.assigned_to_agent_key_id, t.requested_by_agent_key_id,
    t.delegation_depth, t.assignment_chain
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.workspace_id = p_workspace_id
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

-- ── 1l. Auto-provision trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ws_id uuid;
BEGIN
  INSERT INTO workspaces (name, slug, owner_id)
    VALUES ('My Workspace', 'ws-' || substr(md5(NEW.id::text), 1, 8), NEW.id)
    RETURNING id INTO v_ws_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_ws_id, NEW.id, 'owner');

  INSERT INTO app_settings (workspace_id, department_required, require_human_approval_for_agent_keys)
    VALUES (v_ws_id, false, false);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 1m. ensure_user_workspace RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION ensure_user_workspace()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ws_id uuid; v_uid uuid;
BEGIN
  v_uid := auth.uid();

  -- Fast path: workspace already exists
  SELECT workspace_id INTO v_ws_id FROM workspace_members WHERE user_id = v_uid LIMIT 1;
  IF v_ws_id IS NOT NULL THEN RETURN v_ws_id; END IF;

  -- Slow path: create workspace
  INSERT INTO workspaces (name, slug, owner_id)
    VALUES ('My Workspace', 'ws-' || substr(md5(v_uid::text), 1, 8), v_uid)
    ON CONFLICT (owner_id) DO NOTHING
    RETURNING id INTO v_ws_id;

  -- If we lost the race, fetch existing
  IF v_ws_id IS NULL THEN
    SELECT id INTO v_ws_id FROM workspaces WHERE owner_id = v_uid;
    RETURN v_ws_id;
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_ws_id, v_uid, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  INSERT INTO app_settings (workspace_id, department_required, require_human_approval_for_agent_keys)
    VALUES (v_ws_id, false, false)
    ON CONFLICT (workspace_id) DO NOTHING;
  RETURN v_ws_id;
END;
$$;

-- ── 1n. Drop admin_users ──────────────────────────────────────────────

DROP TABLE admin_users;
