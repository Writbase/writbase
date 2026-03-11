# WritBase MVP Roadmap

Actionable implementation checklist derived from PRD.md, organized by
technical domain. Milestones are roughly sequential within each domain;
cross-domain dependencies noted at the bottom.

## Database

### M1: Core schema
- [x] Create enum types: priority, status, actor_type, source, event_category, target_type, agent_role
- [x] Create `projects` table (PRD §10)
- [x] Create `departments` table (PRD §10)
- [x] Create `tasks` table with `version integer DEFAULT 1` (PRD §7.3, §10)
- [x] Create `event_log` table — unified, append-only (PRD §7.4, §10)
- [x] Create `agent_keys` table with `role`, `key_prefix`, SHA-256 `key_hash` (PRD §7.5, §10)
- [x] Create `agent_permissions` table (PRD §10)
- [x] Create `app_settings` table with `require_human_approval_for_agent_keys` (PRD §10)
- [x] Create `rate_limits` table: `(agent_key_id, window_start, request_count)` for Postgres-based per-key rate limiting

### M2: Constraints, indexes, grants
- [x] Foreign keys, NOT NULL, CHECK, UNIQUE constraints across all tables
- [x] Check constraints: role in ('worker','manager'), enums match allowed values
- [x] Index: tasks(project_id, department_id, status)
- [x] Index: tasks(project_id, created_at, id) — compound cursor pagination
- [x] Index: event_log(target_id, event_category)
- [x] Index: agent_permissions(agent_key_id)
- [x] REVOKE UPDATE, DELETE ON event_log FROM anon, authenticated
  - Note: service_role bypasses grants; append-only for Edge Functions is enforced in application code
- [x] GRANT INSERT ON event_log to service_role only (no update/delete in app code)

### M3: RLS policies
- [x] projects, departments, tasks, app_settings: RLS for authenticated admin (human UI path)
- [x] agent_keys, agent_permissions: RLS for authenticated admin
- [x] event_log: RLS read-only for authenticated admin, INSERT via service_role only
- [x] No RLS on agent path — Edge Functions use service_role and handle auth in code

## Auth

### M4: Human auth
- [x] Supabase project setup and Auth configuration
- [x] Admin user registration/login flow
- [x] Session management with Supabase client SDK

### M5: Agent key system
- [x] Key generation: compound format `wb_<key_id>_<secret>` (PRD §7.5)
- [x] SHA-256 hashing of secret portion on creation
- [x] Store `key_prefix` (first 8 chars of secret) for display
- [x] Key lookup function: parse `wb_<key_id>_<secret>`, extract key_id, single DB lookup
- [x] Hash verification using `crypto.timingSafeEqual()` (prevent timing attacks)
- [x] Role resolution from `agent_keys.role` (worker/manager)
- [x] Permission loading: join agent_keys + agent_permissions, return structured scope object
- [x] Update `last_used_at` on successful auth
- [x] Reject inactive keys (`is_active = false`)

## Edge Functions (MCP/API)

### M6: MCP transport layer
- [x] Streamable HTTP endpoint with `@modelcontextprotocol/sdk` + Hono
- [x] Authentication middleware: parse `wb_<key_id>_<secret>` from Authorization header
- [x] Auth runs on ALL MCP lifecycle methods: `initialize`, `tools/list`, AND `tools/call`
- [x] Unauthenticated requests return 401 (including `tools/list`)
- [x] Rate limit check middleware: query rate_limits table before tool execution, return `rate_limited` error with `retry_after`
- [x] Origin header handling: allow missing Origin (agents don't send it), reject unauthorized Origin (rogue browsers)
- [ ] Request logging: key ID, tool name, auth result, latency

### M7: Worker tools — info + get_tasks
- [x] `info` tool: return agent name, role, scopes, special prompt, valid projects/depts (excluding archived)
- [x] `get_tasks` tool: project required (accept slug or UUID), department/status/priority filters
- [x] `get_tasks`: cursor-based pagination with compound cursor (sort_column, id), composite index
- [x] `get_tasks`: max limit 50 enforced server-side, `next_cursor` in response
- [x] `get_tasks`: `updated_after` ISO 8601 filter for change polling
- [x] `get_tasks`: scope enforcement — reject requests outside allowed projects/departments
- [x] `get_tasks`: return `version` field on each task
- [x] Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` on both
- [x] Optional: `outputSchema` on `info` and `get_tasks` (client support fragmented — always return data in `content` array regardless)

### M8: Worker tools — add_task + update_task
- [x] `add_task`: validate project/dept against agent scopes, reject archived project/dept
- [x] `add_task`: create event_log record (`event_category='task'`, `target_type='task'`)
- [x] `update_task`: atomic optimistic concurrency — `UPDATE tasks SET ..., version = version + 1 WHERE id = $1 AND version = $2 RETURNING *` (NOT select-then-update)
- [x] `update_task`: return `version_conflict` error with `current_version` on mismatch
- [x] `update_task`: cross-scope department move — require `can_update` in source AND (`can_create` OR `can_update`) in destination
- [x] `update_task`: field-level provenance — one event_log row per changed field
- [x] Tool annotations: `add_task` non-idempotent, `update_task` idempotent; both `openWorldHint: false`
- [x] Optional: `outputSchema` on `add_task` and `update_task` (client support fragmented — always return data in `content` array regardless)

### M9: Dynamic schema per role
- [x] Tool visibility: workers see 4 tools, managers see 9 in `tools/list` response
- [x] Description-based hints: inject valid projects/depts into tool description text
- [x] Dynamic enum injection for project/department params (best-effort, client-dependent)
- [x] Default value injection when agent has exactly one project
- [x] Per-request schema generation from permissions (one DB query + in-memory assembly)

### M10: Manager tools
- [x] `manage_agent_keys`: list/create/update/deactivate worker keys
- [x] `manage_agent_keys`: enforce cannot create manager keys, cannot modify own key
- [x] `manage_agent_keys`: return secret once on create (full `wb_<key_id>_<secret>` format)
- [x] `manage_agent_keys`: rotate action (generate new secret, hash, invalidate old, return new secret once, log event)
- [x] `manage_agent_permissions`: grant/revoke with per-row subset constraint (each granted row dominated by single manager row)
- [x] `manage_agent_permissions`: enforce cannot modify own permissions
- [x] `get_provenance`: filtered event_log read, scoped to projects where manager has `can_read`
- [x] `get_provenance`: cursor pagination, max limit 50
- [x] `manage_projects`: create/rename/archive projects
- [x] `manage_departments`: create/rename/archive departments
- [x] All manager actions: mandatory event_log entry (`event_category='admin'`)
- [x] Optional: `outputSchema` on manager tools (client support fragmented — always return data in `content` array regardless)

### M11: Human API endpoints
- [x] Project CRUD: GET/POST/PATCH /api/projects
- [x] Department CRUD: GET/POST/PATCH /api/departments
- [x] Task CRUD: GET/POST/PATCH /api/tasks
- [x] Task history: GET /api/tasks/:id/history (filtered event_log query)
- [ ] Agent keys: GET/POST/PATCH /api/agent-keys, POST /api/agent-keys/:id/rotate
- [x] Event log: GET /api/event-log (admin access)

## Backend (Business Logic)

### M12: Validation and error handling
- [x] Task validation: required fields, enum checks, min lengths (PRD §12)
- [x] Permission validation: active key, matching scope, archived entity checks
- [x] Department move validation: auth in both source and destination scope
- [x] Version validation: reject stale version with `version_conflict` error + `current_version`
- [x] Error response format: `{ error: { code, message, recovery } }` for all errors (PRD §14)
- [x] All error codes implemented with recovery guidance (PRD §14)
- [x] Validation errors: per-field detail in `fields` object
- [x] Rate limiting: Postgres-based counter per agent key — `INSERT INTO rate_limits ... ON CONFLICT DO UPDATE SET count = count + 1` per time window
  - Note: in-memory counters are unreliable — Deno Deploy isolates are stateless with no guaranteed persistence between requests

### M13: Manager permission enforcement
- [x] Per-row subset constraint: for each granted row, find a single dominating manager row (same project, same-or-broader dept where NULL = whole project, actions ⊆)
- [x] No self-modification check (key, permissions, role)
- [x] Workers-only check (cannot create manager keys)
- [x] Optional human approval queue: if `app_settings.require_human_approval_for_agent_keys`, new keys created by managers start as `is_active = false`

## Frontend

### M14: App shell + project/department management
- [x] Next.js app setup with Supabase Auth integration
- [x] Left sidebar: project selector, department selector
- [x] Add project modal (create, rename, archive)
- [x] Add department modal (create, rename, archive)

### M15: Tasks table
- [x] Task list table with all MVP columns (PRD §7.8)
- [x] Filter by project and department (from sidebar selection)
- [x] Sort by created date, due date, priority, status
- [x] Create task modal/drawer
- [x] Edit task inline or via modal
- [x] Display version conflict errors on save

### M16: Agent keys admin
- [x] List agent keys: key prefix, role badge, active status, last used timestamp
- [x] Create key flow: name input, role selection (manager only settable by humans), show full secret once
- [x] Edit special prompt
- [x] Activate/deactivate toggle
- [x] Permission rows editor: add/remove (project, department, actions) tuples per key

### M17: Provenance UI
- [x] Task detail side panel or drawer
- [x] History timeline from event_log (filtered by target_id = task_id, event_category = 'task')
- [x] Display: actor label, timestamp, field changed, old → new values

### M18: Hardening
- [x] Request ID generation and propagation across Edge Functions
- [x] Error states and loading states in UI
- [x] Archived entity behavior in UI (hide from selectors, show on existing tasks)
- [x] Edge-case validation (slug changes, empty results, etc.)

## Cross-domain dependencies

```
M1 → M2 (schema then constraints/indexes)
M4 → M3 (human auth before RLS policies — RLS uses auth.uid())
M4 + M5 → M6 (auth systems before MCP transport)
M6 → M7 → M8 (transport, then read tools, then write tools)
M8 → M10 (worker tools before manager tools)
M10 → M9 (all 9 tools defined before dynamic schema can filter by role)
M10 → M13 (manager tools before manager enforcement logic)
M11 can start after M5 (needs auth, parallels M7-M10)
M14 can start after M4 (needs human auth)
M15-M17 after M11 (needs API endpoints)
M18 after M15-M17 (hardening last)
```
