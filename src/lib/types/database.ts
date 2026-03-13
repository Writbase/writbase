import type {
  ActorType,
  AgentRole,
  EventCategory,
  Priority,
  Source,
  Status,
  TargetType,
} from './enums';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  is_archived: boolean;
  created_at: string;
  created_by: string | null;
  workspace_id: string;
}

export interface Department {
  id: string;
  name: string;
  slug: string;
  is_archived: boolean;
  created_at: string;
  created_by: string | null;
  workspace_id: string;
}

export interface Task {
  id: string;
  project_id: string;
  department_id: string | null;
  priority: Priority;
  description: string;
  notes: string | null;
  due_date: string | null;
  status: Status;
  version: number;
  created_at: string;
  updated_at: string;
  created_by_type: ActorType;
  created_by_id: string;
  updated_by_type: ActorType;
  updated_by_id: string;
  source: Source;
  assigned_to_agent_key_id: string | null;
  requested_by_agent_key_id: string | null;
  delegation_depth: number;
  assignment_chain: string[];
  is_archived: boolean;
  workspace_id: string;
}

export interface EventLog {
  id: string;
  event_category: EventCategory;
  target_type: TargetType;
  target_id: string;
  event_type: string;
  field_name: string | null;
  old_value: unknown | null;
  new_value: unknown | null;
  actor_type: ActorType;
  actor_id: string;
  actor_label: string;
  source: Source;
  created_at: string;
  workspace_id: string;
}

export interface AgentKey {
  id: string;
  name: string;
  role: AgentRole;
  key_hash: string;
  key_prefix: string;
  is_active: boolean;
  special_prompt: string | null;
  created_at: string;
  last_used_at: string | null;
  created_by: string;
  workspace_id: string;
  default_project_id: string | null;
  default_department_id: string | null;
}

export interface AgentPermission {
  id: string;
  agent_key_id: string;
  project_id: string;
  department_id: string | null;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_assign: boolean;
  can_comment: boolean;
  can_archive: boolean;
  created_at: string;
  workspace_id: string;
}

export interface AppSettings {
  id: string;
  department_required: boolean;
  require_human_approval_for_agent_keys: boolean;
  max_agent_keys_per_manager: number | null;
  created_at: string;
  updated_at: string;
  workspace_id: string;
}

export interface RateLimit {
  agent_key_id: string;
  window_start: string;
  request_count: number;
}

export interface WebhookSubscription {
  id: string;
  agent_key_id: string;
  project_id: string;
  event_types: string[];
  url: string;
  secret: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  workspace_id: string;
}

export interface AgentCapabilities {
  agent_key_id: string;
  skills: string[];
  description: string | null;
  accepts_tasks: boolean;
  created_at: string;
  updated_at: string;
  workspace_id: string;
}
