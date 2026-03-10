export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type ActorType = 'human' | 'agent' | 'system';
export type Source = 'ui' | 'mcp' | 'api' | 'system';
export type EventCategory = 'task' | 'admin' | 'system';
export type TargetType = 'task' | 'agent_key' | 'project' | 'department';
export type AgentRole = 'worker' | 'manager';
