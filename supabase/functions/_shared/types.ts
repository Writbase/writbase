export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type Status = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'failed'
export type ActorType = 'human' | 'agent' | 'system'
export type Source = 'ui' | 'mcp' | 'api' | 'system'
export type EventCategory = 'task' | 'admin' | 'system'
export type TargetType = 'task' | 'agent_key' | 'project' | 'department'
export type AgentRole = 'worker' | 'manager'

export interface AgentPermission {
  id: string
  projectId: string
  projectSlug: string
  projectName: string
  departmentId: string | null
  departmentSlug: string | null
  departmentName: string | null
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canAssign: boolean
  canComment: boolean
  canArchive: boolean
  isProjectArchived: boolean
  isDepartmentArchived: boolean | null
}

export interface AgentContext {
  keyId: string
  name: string
  role: AgentRole
  isActive: boolean
  specialPrompt: string | null
  permissions: AgentPermission[]
  workspaceId: string
  projectId: string | null
  departmentId: string | null
}

export interface AgentKeyRecord {
  id: string
  name: string
  role: AgentRole
  key_hash: string
  key_prefix: string
  is_active: boolean
  special_prompt: string | null
  created_at: string
  last_used_at: string | null
  created_by: string
  workspace_id: string
  project_id: string | null
  department_id: string | null
}
