CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
CREATE TYPE actor_type AS ENUM ('human', 'agent', 'system');
CREATE TYPE source AS ENUM ('ui', 'mcp', 'api', 'system');
CREATE TYPE event_category AS ENUM ('task', 'admin', 'system');
CREATE TYPE target_type AS ENUM ('task', 'agent_key', 'project', 'department');
CREATE TYPE agent_role AS ENUM ('worker', 'manager');
