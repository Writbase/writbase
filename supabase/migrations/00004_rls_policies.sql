-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Helper: admin check expression
-- auth.uid() IN (SELECT user_id FROM admin_users)

-- projects: full CRUD for admins
CREATE POLICY "admin_select_projects" ON projects
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_projects" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_projects" ON projects
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_projects" ON projects
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- departments: full CRUD for admins
CREATE POLICY "admin_select_departments" ON departments
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_departments" ON departments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_departments" ON departments
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_departments" ON departments
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- tasks: full CRUD for admins
CREATE POLICY "admin_select_tasks" ON tasks
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_tasks" ON tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_tasks" ON tasks
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- agent_keys: full CRUD for admins
CREATE POLICY "admin_select_agent_keys" ON agent_keys
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_agent_keys" ON agent_keys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_agent_keys" ON agent_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_agent_keys" ON agent_keys
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- agent_permissions: full CRUD for admins
CREATE POLICY "admin_select_agent_permissions" ON agent_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_agent_permissions" ON agent_permissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_agent_permissions" ON agent_permissions
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_agent_permissions" ON agent_permissions
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- app_settings: full CRUD for admins
CREATE POLICY "admin_select_app_settings" ON app_settings
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_insert_app_settings" ON app_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_app_settings" ON app_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_app_settings" ON app_settings
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- event_log: SELECT only for admins, INSERT via service_role only (no RLS policy for insert = blocked for anon/authenticated)
CREATE POLICY "admin_select_event_log" ON event_log
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- rate_limits: no direct access (managed by service_role in Edge Functions)
-- No policies = all access denied for anon/authenticated; service_role bypasses RLS

-- admin_users: SELECT for authenticated (so RLS policies can self-check)
CREATE POLICY "authenticated_select_admin_users" ON admin_users
  FOR SELECT TO authenticated
  USING (true);

-- admin_users: INSERT/UPDATE/DELETE for existing admins only
CREATE POLICY "admin_insert_admin_users" ON admin_users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_update_admin_users" ON admin_users
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "admin_delete_admin_users" ON admin_users
  FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- Append-only trigger on event_log (service_role bypasses RLS but not triggers)
CREATE FUNCTION prevent_event_log_mutation() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'event_log is append-only: % not permitted', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION prevent_event_log_mutation();

-- updated_at trigger for tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
