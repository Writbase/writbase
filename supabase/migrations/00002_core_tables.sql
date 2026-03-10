-- projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id)
);

-- departments
CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id)
);

-- tasks
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  department_id uuid REFERENCES departments(id),
  priority priority DEFAULT 'medium' NOT NULL,
  description text NOT NULL,
  notes text,
  due_date timestamptz,
  status status DEFAULT 'todo' NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by_type actor_type NOT NULL,
  created_by_id text NOT NULL,
  updated_by_type actor_type NOT NULL,
  updated_by_id text NOT NULL,
  source source NOT NULL
);

-- event_log
CREATE TABLE event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_category event_category NOT NULL,
  target_type target_type NOT NULL,
  target_id uuid NOT NULL,
  event_type text NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  actor_type actor_type NOT NULL,
  actor_id text NOT NULL,
  actor_label text NOT NULL,
  source source NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- agent_keys
CREATE TABLE agent_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role agent_role DEFAULT 'worker' NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  special_prompt text,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_used_at timestamptz,
  created_by text NOT NULL
);

-- agent_permissions
CREATE TABLE agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key_id uuid NOT NULL REFERENCES agent_keys(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  department_id uuid REFERENCES departments(id),
  can_read boolean DEFAULT false NOT NULL,
  can_create boolean DEFAULT false NOT NULL,
  can_update boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE NULLS NOT DISTINCT (agent_key_id, project_id, department_id)
);

-- app_settings
CREATE TABLE app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_required boolean DEFAULT false NOT NULL,
  require_human_approval_for_agent_keys boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- rate_limits
CREATE TABLE rate_limits (
  agent_key_id uuid NOT NULL REFERENCES agent_keys(id),
  window_start timestamptz NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  UNIQUE (agent_key_id, window_start)
);

-- admin_users
CREATE TABLE admin_users (
  user_id uuid REFERENCES auth.users(id) PRIMARY KEY
);
