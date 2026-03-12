# WritBase Roadmap

Implementation status organized by technical domain. See [docs/concepts.md](docs/concepts.md)
for architecture details.

## Database

### M1: Core schema
- [x] Enum types: priority, status, actor_type, source, event_category, target_type, agent_role
- [x] `projects` table
- [x] `departments` table
- [x] `tasks` table with `version integer DEFAULT 1` (optimistic concurrency)
- [x] `event_log` table — unified, append-only
- [x] `agent_keys` table with `role`, `key_prefix`, SHA-256 `key_hash`
- [x] `agent_permissions` table
- [x] `app_settings` table with `require_human_approval_for_agent_keys`
- [x] `rate_limits` table for Postgres-based per-key rate limiting

### M2: Constraints, indexes, grants
- [x] Foreign keys, NOT NULL, CHECK, UNIQUE constraints across all tables
- [x] Check constraints: role in ('worker','manager'), enums match allowed values
- [x] Index: tasks(project_id, department_id, status)
- [x] Index: tasks(project_id, created_at, id) — compound cursor pagination
- [x] Index: event_log(target_id, event_category)
- [x] Index: agent_permissions(agent_key_id)
- [x] REVOKE UPDATE, DELETE ON event_log FROM anon, authenticated
- [x] GRANT INSERT ON event_log to service_role only

### M3: RLS policies
- [x] Workspace-scoped RLS on all data tables (M23)
- [x] event_log: RLS read-only for authenticated users, INSERT via service_role only
- [x] No RLS on agent path — Edge Functions use service_role and handle auth in code

## Auth

### M4: Human auth
- [x] Supabase Auth configuration
- [x] Signup with auto-provisioned workspace (Postgres trigger on auth.users INSERT)
- [x] Session management with Supabase client SDK

### M5: Agent key system
- [x] Key generation: compound format `wb_<key_id>_<secret>`
- [x] SHA-256 hashing of secret portion on creation
- [x] Store `key_prefix` (first 8 chars of secret) for display
- [x] Key lookup: parse compound key, extract key_id, single DB lookup
- [x] Timing-safe hash verification
- [x] Role resolution (worker/manager)
- [x] Permission loading: join agent_keys + agent_permissions
- [x] Update `last_used_at` on successful auth
- [x] Reject inactive keys

## MCP Server

### M6: Transport layer
- [x] Streamable HTTP endpoint with `@modelcontextprotocol/sdk` + Hono
- [x] Authentication middleware
- [x] Auth on all MCP lifecycle methods: `initialize`, `tools/list`, `tools/call`
- [x] Rate limit middleware
- [x] CORS: allow missing Origin (CLI agents), validate browser Origin
- [x] Request logging: key ID, tool name, auth result, latency

### M7: Worker tools — info + get_tasks
- [x] `info`: agent name, role, scopes, special prompt, valid projects/depts
- [x] `get_tasks`: project required, department/status/priority filters
- [x] Cursor-based pagination with compound cursor
- [x] Max limit 50 enforced server-side
- [x] `updated_after` filter for change polling
- [x] Scope enforcement
- [x] Tool annotations

### M8: Worker tools — add_task + update_task
- [x] `add_task`: scope validation, reject archived project/dept, event_log
- [x] `update_task`: atomic optimistic concurrency (`WHERE version = $2`)
- [x] `update_task`: `version_conflict` error with `current_version`
- [x] Cross-scope department move authorization
- [x] Field-level provenance in event_log

### M9: Dynamic schema per role
- [x] Tool visibility: workers see 4 tools, managers see 11 in `tools/list`
- [x] Description-based hints: valid projects/depts in tool description
- [x] Dynamic enum injection for project/department params
- [x] Default value injection for single-project agents
- [x] Per-request schema generation

### M10: Manager tools
- [x] `manage_agent_keys`: list/create/update/deactivate/rotate
- [x] `manage_agent_permissions`: grant/revoke with per-row subset constraint
- [x] `get_provenance`: filtered event_log, cursor pagination
- [x] `manage_projects`: create/rename/archive
- [x] `manage_departments`: create/rename/archive
- [x] All manager actions logged in event_log

### M11: Human API endpoints
- [x] Project CRUD: GET/POST/PATCH /api/projects
- [x] Department CRUD: GET/POST/PATCH /api/departments
- [x] Task CRUD: GET/POST/PATCH /api/tasks
- [x] Task history: GET /api/tasks/:id/history
- [x] Agent keys: GET/POST/PATCH /api/agent-keys, POST /api/agent-keys/:id/rotate
- [x] Event log: GET /api/event-log

## Business Logic

### M12: Validation and error handling
- [x] Task validation: required fields, enum checks, min lengths
- [x] Permission validation: active key, matching scope, archived entity checks
- [x] Department move validation
- [x] Version conflict detection
- [x] Structured error responses with recovery guidance
- [x] Per-field validation error details
- [x] Postgres-based rate limiting per agent key

### M13: Manager permission enforcement
- [x] Per-row subset constraint
- [x] No self-modification check
- [x] Workers-only check (cannot create manager keys)
- [x] Optional human approval queue for agent-created keys

## Frontend

### M14: App shell
- [x] Next.js 16 with Supabase Auth
- [x] Left sidebar: project selector, department selector
- [x] Project management (create, rename, archive)
- [x] Department management (create, rename, archive)

### M15: Tasks table
- [x] Task list with all columns
- [x] Filter by project and department
- [x] Sort by created date, due date, priority, status
- [x] Create/edit task modal
- [x] Version conflict error display

### M16: Agent keys admin
- [x] Key list: prefix, role badge, active status, last used
- [x] Create key flow with one-time secret display
- [x] Special prompt editor
- [x] Activate/deactivate toggle
- [x] Permission rows editor

### M17: Provenance UI
- [x] Task detail side panel
- [x] History timeline from event_log
- [x] Actor, timestamp, field, old → new values

### M18: Hardening
- [x] Request ID generation and propagation
- [x] Error and loading states in UI
- [x] Archived entity behavior
- [x] Edge-case validation

## Inter-Agent Task Exchange

### M19: Task assignment + delegation safety
- [x] `assigned_to_agent_key_id`, `requested_by_agent_key_id` on tasks
- [x] `delegation_depth` (max 3) + `assignment_chain` for cycle detection
- [x] `can_assign` permission
- [x] `assign_to` param on `add_task` and `update_task`
- [x] `assigned_to_me` / `requested_by_me` filters on `get_tasks`
- [x] Assignment and reassignment events in event_log

### M20: Webhook notifications
- [x] `webhook_subscriptions` table
- [x] `subscribe` MCP tool (manager only)
- [ ] Webhook delivery: pg_net trigger → fan out with HMAC-SHA256

### M21: Agent discovery
- [x] `agent_capabilities` table (skills[], description)
- [x] `discover_agents` MCP tool (manager only, filterable by skill)

### M22: A2A protocol endpoints (deferred)
- [ ] A2A-compliant task lifecycle endpoints (pending A2A spec v1.0)
- [ ] Agent Cards at `.well-known/agent.json`

## Workspace Architecture

### M23: Multi-tenant workspace model
- [x] `workspaces` + `workspace_members` tables
- [x] `workspace_id` NOT NULL on all data tables
- [x] `get_user_workspace_ids()` RLS helper
- [x] Workspace-scoped RLS policies
- [x] Auto-provisioning on signup (`handle_new_user()` trigger)
- [x] `ensure_user_workspace()` idempotent fallback
- [x] Cross-workspace integrity triggers
- [x] WorkspaceProvider React context
- [x] All MCP tools filter by `ctx.workspaceId`

### M24: Multi-member workspaces (future)
- [ ] Invite flow
- [ ] Role-based workspace permissions (owner, admin, member)
- [ ] Workspace member management UI
