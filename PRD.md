# PRD, WritBase MVP

## 1. Overview

Build a lightweight, agent-first task system for managing work across multiple projects and departments, with a minimal human UI and a machine-first MCP/API layer.

This product is **not** a general-purpose team task manager. It is a control plane for AI agents and the human operator who supervises them.

### Core idea

* Each user owns a **workspace** — an isolated tenant that contains all their projects, tasks, agents, and settings.
* Tasks live outside repositories.
* Every task belongs to a **project** and optionally to a **department**, all scoped to a workspace.
* Agents access tasks through scoped API keys with explicit read/write permissions.
* MCP exposes a small set of tools and returns agent-specific metadata, including permissions and a special instruction prompt.
* All changes are recorded with provenance/history.
* Signup automatically provisions a workspace — no manual bootstrap required.

### 1.5 Problem Statement

Current pain points this product addresses:

* Tasks are scattered across Airtable, Slack, and local files with no single source of truth.
* Agents have no reliable, standardized way to access and update tasks across projects.
* There is no audit trail for agent actions — when an agent changes a task, there is no record of who did what or why.
* There are no scoped permissions — agents either have full access or none, with no project/department-level controls.
* Manual task coordination between multiple agents is error-prone and time-consuming for the human operator.

### 1.7 Competitive Landscape

* **MCP task servers** (Shrimp Task Manager, gpayer): File-based storage, designed for single-agent use. No multi-agent permissions or persistent database.
* **Agent dashboards** (Mission Control by builderz-labs): No MCP-native access for agents, no fine-grained per-agent permissions.
* **Agent frameworks** (CrewAI, LangGraph): Ephemeral task state within a run. No persistent task registry across sessions or agents.
* **WritBase's position**: MCP-native + Postgres-backed + multi-agent permissions + provenance. No existing tool combines all four.

## 2. Product Goals

### Goals

* Provide a single task registry for multiple projects.
* Make the system easy for agents to use via MCP and API.
* Support project and department scoping as first-class concepts.
* Support per-agent permissions at project and department level.
* Expose a simple, fast human UI for oversight and manual edits.
* Preserve full change history for trust and debugging.

### Non-goals for MVP

* Full kanban or rich project management workflows.
* Comments, mentions, attachments, subtasks, dependencies.
* Time tracking or sprint planning.
* Complex workflow engines.
* Billing, organizations, teams, external customer access.
* Public marketplace or plugin ecosystem.

## 3. Users and Personas

### Primary user

**Owner / operator**

* Signs up to create a workspace (auto-provisioned).
* Manages multiple projects within their workspace.
* Creates projects, departments, and agent keys.
* Reviews tasks and history.
* Uses UI occasionally, uses agents heavily.

### Secondary user

**AI agent (worker)**

* Reads allowed tasks.
* Creates tasks when it finds work.
* Updates status, notes, or priority if permitted.
* Receives a scoped prompt and dynamic schema hints.

### Tertiary user

**AI agent (manager)**

* All worker capabilities within its permitted scopes.
* Creates and manages worker agent keys (bounded by own permissions).
* Sets permissions for worker keys (cannot exceed own scope).
* Reads provenance/event log across allowed projects.
* Manages projects and departments (create, rename, archive).
* Cannot create other manager keys or modify own key/permissions/role.
* Reduces human operator workload for routine agent administration tasks.

## 4. MVP Scope

### Human UI

Left sidebar:

* Project selector
* Department selector
* Add project
* Add department

Main view:

* Tasks table
* Create/edit task modal or drawer
* Provenance/history view for a task
* Agent keys admin page

### MCP/API

Worker MCP tools:

* `info`
* `get_tasks`
* `add_task`
* `update_task`

Manager MCP tools (additional):

* `manage_agent_keys` — list/create/update/deactivate worker keys
* `manage_agent_permissions` — set permissions (bounded by own scope)
* `get_provenance` — read event log across allowed projects
* `manage_projects` — create/rename/archive projects
* `manage_departments` — create/rename/archive departments

### Permissions

* Agent API keys with compound credential format (`wb_<key_id>_<secret>`)
* Per key: allowed project/department access
* Separate read and update permissions
* Optional create permission
* Special prompt attached to each agent key
* Role field: `worker` (default) or `manager`

### Data and infra

* Supabase Auth for human users
* Postgres as source of truth
* Supabase Edge Functions for API/MCP endpoints
* Next.js for UI

## 5. Product Principles

1. **Agent-first**. API and MCP design matter more than UI polish.
2. **Scoped by default**. Project is mandatory, department is recommended and can be optional at system level.
3. **Explicit permissions**. No implicit broad access for agents.
4. **Auditable**. Every meaningful change has provenance.
5. **Minimal surface area**. Small number of entities, small number of operations.
6. **Deterministic behavior**. MCP responses should be predictable and easy for agents to consume.

## 6. User Stories

### Owner

* As an owner, I can create projects.
* As an owner, I can create departments within a project or globally reuse named departments across projects.
* As an owner, I can view tasks filtered by project and department.
* As an owner, I can create and edit tasks in a table-oriented interface.
* As an owner, I can create agent API keys.
* As an owner, I can grant an agent read/create/update permissions for selected project/department combinations.
* As an owner, I can attach a special prompt to an agent key.
* As an owner, I can inspect the full history of a task.
* As an owner, I can set an agent key's role to `manager`.

### Agent (worker)

* As a worker agent, I can query metadata about my allowed scope.
* As a worker agent, I can retrieve tasks only from allowed project/department scopes.
* As a worker agent, I can create a task only in scopes where create is allowed.
* As a worker agent, I can update a task only in scopes where update is allowed.
* As a worker agent, I can read my special prompt through the `info` tool.
* As a worker agent, I can see valid project and department values in tool schema or tool description for my key.

### Agent (manager)

* As a manager agent, I can perform all worker actions within my scopes.
* As a manager agent, I can create and manage worker agent keys.
* As a manager agent, I can set permissions for worker keys, bounded by my own scope.
* As a manager agent, I can read the event log for projects I have access to.
* As a manager agent, I can create, rename, and archive projects and departments.
* As a manager agent, I cannot create other manager keys.
* As a manager agent, I cannot modify my own key, permissions, or role.

## 7. Functional Requirements

## 7.1 Projects

* Human user or manager agent can create, rename, archive projects.
* Each project has:

  * `id`
  * `name`
  * `slug`
  * `is_archived`
  * `created_at`
  * `created_by`

Rules:

* Project name must be unique per workspace for MVP.
* Archived projects cannot receive new tasks by default.

## 7.2 Departments

* Human user or manager agent can create, rename, archive departments.
* Department may be global or project-scoped.

Recommended MVP model:

* Global department catalog, optionally used by any project.
* Example: `engineering`, `research`, `ops`, `legal`, `sales`.

Each department has:

* `id`
* `name`
* `slug`
* `is_archived`
* `created_at`
* `created_by`

Rules:

* Department may be optional for tasks if system setting `department_required = false`.
* If department is archived, existing tasks remain valid. Creating new tasks in archived departments is blocked.
* Updates to tasks already in archived departments are allowed (the task already exists there).

## 7.3 Tasks

Tasks are displayed in a table.

Required columns for MVP UI:

* Project Name
* Priority
* Description
* Notes
* Department
* Due Date
* Created Date
* Status

Recommended underlying fields:

* `id`
* `project_id` (required)
* `department_id` (nullable if department optional)
* `priority` enum
* `description` text
* `notes` text
* `status` enum
* `due_date` timestamptz nullable
* `created_at`
* `updated_at`
* `created_by_type` (`human`, `agent`, `system`)
* `created_by_id`
* `updated_by_type`
* `updated_by_id`
* `source` (`ui`, `mcp`, `api`, `system`)
* `version` integer, default 1

Suggested enums:

* `priority`: `low`, `medium`, `high`, `critical`
* `status`: `todo`, `in_progress`, `blocked`, `done`, `cancelled`

Task rules:

* Task must belong to exactly one project.
* Task may belong to zero or one department in MVP.
* Description is required.
* Notes are optional.
* Status defaults to `todo`.
* Priority defaults to `medium`.
* Created date is immutable.
* `version` increments on every successful update (optimistic concurrency control).

## 7.4 Event Log (Provenance)

System must capture an event record for all meaningful changes. The `event_log` table is a unified, append-only log covering both task provenance and admin audit trail. No UPDATE or DELETE grants on this table.

Task events:

* task created
* task updated
* status changed
* priority changed
* notes changed
* department changed

Admin events:

* agent key created/updated/deactivated
* permissions granted/revoked
* project created/renamed/archived
* department created/renamed/archived

Each event row includes:

* `id`
* `event_category` — `task` | `admin` | `system`
* `target_type` — `task` | `agent_key` | `project` | `department`
* `target_id` (uuid, the entity being acted on)
* `event_type`
* `field_name` nullable
* `old_value` jsonb nullable
* `new_value` jsonb nullable
* `actor_type` (`human`, `agent`, `system`)
* `actor_id`
* `actor_label` for display
* `source` (`ui`, `mcp`, `api`, `system`)
* `created_at`

Task-specific history is a filtered view: `WHERE event_category = 'task' AND target_id = <task_id>`.

MVP UI requirement:

* User can open a task history panel and inspect chronological changes. This reads from `event_log` filtered by the task's ID.

## 7.5 Agent API Keys

Human owner can create agent API keys. Manager agents can create worker keys (bounded by own scope).

Each key has:

* `id`
* `name`
* `role` — `worker` (default) | `manager`
* `key_hash` (SHA-256 of the secret portion)
* `key_prefix` (first 8 chars of the secret, for display/identification)
* `is_active`
* `special_prompt` text
* `created_at`
* `last_used_at`
* `created_by`

### Compound credential format

API keys use the format `wb_<key_id>_<secret>`:

* `wb_` — fixed prefix identifying a WritBase key
* `<key_id>` — the UUID of the key record in `agent_keys`
* `<secret>` — a high-entropy random string

On authentication, the server extracts `key_id` from the credential, looks up the key by ID (single DB lookup), then verifies the secret against the stored SHA-256 hash. This avoids the N-key comparison problem that bcrypt would introduce (bcrypt is non-deterministic — you cannot look up by hash, and comparing each key costs ~250ms).

SHA-256 is the industry standard for API key hashing (used by Stripe, GitHub, AWS). Unlike passwords, API keys are high-entropy random strings where SHA-256 is sufficient and avoids bcrypt's compute cost.

### Roles

* `worker` (default): Can use task tools (`info`, `get_tasks`, `add_task`, `update_task`) within permitted scopes.
* `manager`: All worker capabilities plus admin tools (`manage_agent_keys`, `manage_agent_permissions`, `get_provenance`, `manage_projects`, `manage_departments`).
* Only humans can set `role = 'manager'`. Manager agents can only create worker keys.

### Manager enforcement rules

1. **Subset constraint (per-row dominance)**: Each permission row granted to a new key must be individually dominated by a single row the manager holds. "Dominated" means: same project, same-or-broader department scope (where `dept=NULL` is broadest, covering whole project), and actions are a subset. A manager with `(Project X, dept=NULL, read+create)` can grant `(Project X, dept=Engineering, read)` because NULL covers all departments. But a manager with `(Project X, dept=Engineering, read+create)` and `(Project X, dept=Marketing, read+update)` CANNOT grant `(Project X, dept=NULL, read)` — no single row covers whole-project scope. Combining capabilities across rows is not allowed.
2. **No self-modification**: Cannot alter own key/permissions/role.
3. **Workers only**: Cannot create other manager keys.
4. **Mandatory provenance**: All admin actions logged in `event_log`.
5. **Optional human approval queue**: Keys created by managers can require human activation (configurable via `app_settings.require_human_approval_for_agent_keys`).

### Permissions model

* Permissions are defined per `(agent_key, project, department)` scope.
* Supported capabilities:

  * `can_read`
  * `can_create`
  * `can_update`

Interpretation:

* If `department_id` is NULL in a permission row, the permission applies to the whole project. Examples:
  * Agent has `(Project X, dept=NULL, can_read=true)` → can read ALL tasks in Project X regardless of department.
  * Agent has `(Project X, dept=Engineering, can_create=true)` → can create tasks only in the Engineering department of Project X.
  * When both rows exist, "any matching allow rule grants" — so the agent can read all tasks in Project X AND create tasks in Engineering.
* Department-specific row can narrow or expand access depending on implementation policy.

Recommended MVP policy behavior:

* Allow rules only, no explicit deny rules.
* Matching rule grants access.
* Most specific match wins for schema hinting.
* For authorization, any matching allow rule grants requested action.

Example:

* Agent A

  * Project X, Department Engineering: read/create/update
  * Project X, Department Legal: create only

### Permission edge cases

* **Archived entities in `info`**: The `info` response excludes archived projects and departments.
* **Project identifier in MCP tools**: Accept both slug and UUID. If a project's slug changes, return a clear error with the new slug.

## 7.6 MCP Tools

MCP is a first-class interface.

### Transport and protocol

* **Transport**: Streamable HTTP (standalone HTTP+SSE transport deprecated per 2025-03-26 MCP spec). Streamable HTTP still uses SSE internally for streaming responses. Uses `@modelcontextprotocol/sdk` (canonical SDK) with Hono for HTTP routing. Originally considered `mcp-lite` but the official SDK provides better protocol compliance and maintenance.
* **Stateless**: Each tool call is independently authenticated. No sessions.
* **Error handling**: Errors returned in tool result objects (not protocol-level). Each error includes recovery guidance telling the agent what to do next.

### Worker Tool 1: `info`

Purpose:

* Return metadata about the current agent key and allowed scopes.

Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`

Response should include:

* agent name
* role
* active status
* allowed scopes summary
* special prompt
* allowed operations
* valid project list (excluding archived)
* valid department list per project if applicable (excluding archived)
* whether department is required

Example response shape:

```json
{
  "agent": {
    "name": "cloud-code-engineering",
    "role": "worker",
    "is_active": true
  },
  "permissions": {
    "department_required": false,
    "scopes": [
      {
        "project": "proofcodec",
        "department": "engineering",
        "can_read": true,
        "can_create": true,
        "can_update": true
      },
      {
        "project": "proofcodec",
        "department": "legal",
        "can_read": false,
        "can_create": true,
        "can_update": false
      }
    ]
  },
  "special_prompt": "Focus on implementation tasks, keep descriptions concrete, do not mark done without evidence."
}
```

### Worker Tool 2: `get_tasks`

Purpose:

* Return tasks visible to this agent, optionally filtered.

Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`

Input:

* `project` required (accepts slug or UUID)
* `department` optional
* `status` optional
* `priority` optional
* `limit` optional, max 50 (enforced server-side)
* `cursor` optional (opaque string for cursor-based pagination)
* `updated_after` optional (ISO 8601 timestamp for change polling)

Behavior:

* Must reject requests outside allowed scope.
* Returns normalized task objects, including `version` field.
* Enforces max `limit` of 50 to prevent blowing Edge Function CPU budget on large result sets.

Response includes:

* `tasks` array
* `next_cursor` (present when more results exist, omitted otherwise)

### Worker Tool 3: `add_task`

Purpose:

* Create a task in allowed scope.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

Input:

* `project` (accepts slug or UUID)
* `department` optional unless required
* `priority` optional
* `description`
* `notes` optional
* `due_date` optional
* `status` optional, default `todo`

Behavior:

* Validate project and department against agent's allowed scopes.
* Must reject create if permission missing.
* Must reject create in archived project or archived department.
* Create provenance record in `event_log`.

### Worker Tool 4: `update_task`

Purpose:

* Update an existing task.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`

Input:

* `task_id`
* `version` (required — optimistic concurrency control)
* mutable fields subset:

  * `priority`
  * `description`
  * `notes`
  * `department`
  * `due_date`
  * `status`

Behavior:

* Must verify task belongs to allowed scope.
* Must verify update permission.
* Must capture field-level provenance in `event_log`.
* **Optimistic concurrency**: Server rejects update if provided `version` does not match current `version` in database. On mismatch, returns error with `current_version` so agent can re-read and retry. On success, `version` increments by 1.
* **Cross-scope department moves**: Changing `department` requires authorization in BOTH source and destination scope. Source scope requires `can_update`. Destination scope requires `can_create` or `can_update`.
* Every update requires a prior read (via `get_tasks`) to obtain the current version — this is intentional, ensuring agents always work with fresh data.

Version conflict error shape:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "Task was modified by another agent. Re-read the task using get_tasks, then retry your update with the new version number.",
    "current_version": 5
  }
}
```

### Manager Tool 5: `manage_agent_keys`

Purpose:

* List, create, update, or deactivate worker agent keys.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

Actions:

* `list` — list all keys visible to this manager
* `create` — create a new worker key (returns secret once)
* `update` — update key name, special prompt, or active status
* `deactivate` — set `is_active = false`

Enforcement:

* Only available to manager role.
* Cannot create manager keys.
* Cannot modify own key.
* All actions logged in `event_log`.

### Manager Tool 6: `manage_agent_permissions`

Purpose:

* Set permissions for worker keys, bounded by manager's own scope.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`

Enforcement:

* Each granted permission row must be dominated by a single row the manager holds (per-row subset constraint).
* Cannot modify own permissions.
* All actions logged in `event_log`.

### Manager Tool 7: `get_provenance`

Purpose:

* Read event log across allowed projects.

Tool annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`

Input:

* `project` required
* `target_type` optional filter
* `event_category` optional filter
* `limit` optional, max 50
* `cursor` optional

Enforcement:

* Only returns events for projects where manager has `can_read`.

### Manager Tool 8: `manage_projects`

Purpose:

* Create, rename, or archive projects.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

Enforcement:

* Only available to manager role.
* All actions logged in `event_log`.

### Manager Tool 9: `manage_departments`

Purpose:

* Create, rename, or archive departments.

Tool annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

Enforcement:

* Only available to manager role.
* All actions logged in `event_log`.

## 7.7 Dynamic Schema Per Role

MCP tool descriptions and input schemas should reflect the current agent key's allowed values and role.

### Guaranteed behavior (must implement)

* **Tool visibility per role**: Worker agents see only task tools (`info`, `get_tasks`, `add_task`, `update_task`). Manager agents also see admin tools (`manage_agent_keys`, `manage_agent_permissions`, `get_provenance`, `manage_projects`, `manage_departments`). This is the primary error-reduction mechanism — agents cannot call tools they cannot see.
* **Description-based hints**: Tool descriptions always include the agent's valid project/department values as text (e.g., "Valid projects: proofcodec, writbase. Valid departments for proofcodec: engineering, research."). This works regardless of client support for dynamic enums.
* **Server-side validation**: All inputs validated server-side regardless of schema hints. Schema is convenience; validation is enforcement.
* **Per-request generation**: Schema generated per authenticated agent key on every request (Edge Functions are stateless). One DB query for permissions + in-memory assembly, well within 2s CPU budget. MCP spec supports dynamic `tools/list` responses.

### Best-effort behavior (implement where MCP client supports it)

* **Dynamic enum injection**: `project` parameter enum filtered to agent's allowed projects. `department` enum filtered per project. If the MCP client does not honor dynamic enums, the description-based hints and server-side validation serve as fallback.
* **Default values**: If agent has exactly one project, pre-fill as default in schema.

This reduces agent errors and improves deterministic behavior.

## 7.8 Human UI Requirements

### Task list page

* Left sidebar with:

  * project selector
  * department selector
  * add project button
  * add department button
* Main table with columns:

  * Project Name
  * Priority
  * Description
  * Notes
  * Department
  * Due Date
  * Created Date
  * Status
* Table supports:

  * filtering by selected project
  * filtering by selected department
  * sorting by created date, due date, priority, status
  * inline or modal edit
  * add task action

### Project management

* Create project modal
* Rename/archive project

### Department management

* Create department modal
* Rename/archive department

### Agent keys page

* List agent keys (showing key prefix, role, active status)
* Create key (select role — only human UI can set manager)
* Show generated secret once (full `wb_<key_id>_<secret>` format)
* Edit special prompt
* Activate/deactivate key
* Manage permission rows by project/department/action
* View last used timestamp

### Provenance UI

* Open task details or side panel
* Show history timeline with actor, timestamp, field changed, old/new values (reads from `event_log` filtered by task)

## 7.9 Non-Functional Requirements

* **Performance**: Task CRUD p95 < 500ms.
* **Edge Function constraints**: 2s CPU limit, ~400ms cold start, 512MB memory, 20MB bundle size.
* **Max `get_tasks` limit**: 50 per request.
* **Rate limiting**: Per-agent-key (mechanism TBD — Supabase has no built-in per-key limiting).

## 8. Authentication and Authorization

## 8.1 Human auth

* Use Supabase Auth for owner login.
* MVP assumes single workspace owned by one user account or a small set of admins.

## 8.2 Agent auth

* Agent authenticates with API key in compound format: `wb_<key_id>_<secret>`.
* Server extracts `key_id`, looks up key record by ID (single DB query).
* Server verifies secret against stored SHA-256 hash.
* Raw secret is shown only once on creation.
* Store only hashed keys in database (SHA-256).
* `key_prefix` (first 8 chars) stored for display/identification in UI.
* Edge Functions authenticate incoming key, load associated permissions and role, and authorize action.

## 8.3 Authorization rules

### Human users

* Authenticated admins can manage all projects, departments, tasks, and keys.

### Worker agents

* Agents can act only within scopes explicitly granted.
* All authorization is enforced server-side in Edge Functions.
* Client-side filtering is convenience only, never security.

### Manager agents

* All worker authorization rules apply.
* Additionally can use admin tools, bounded by own permission scope.
* Per-row subset constraint: each permission granted must be dominated by a single row the manager holds (see Section 7.5 for full rules).
* Cannot create manager keys, cannot modify own key/permissions/role.
* Cross-scope department moves require authorization in both source and destination scope (see Section 7.6, `update_task`).

## 9. Technical Architecture

### Frontend

* Next.js app
* Supabase Auth for session management
* Table-based UI for tasks
* Admin screens for projects, departments, agent keys

### Backend

* Supabase Postgres for storage
* Supabase Edge Functions for:

  * task CRUD APIs
  * MCP tool endpoints (Streamable HTTP transport)
  * agent key auth and permission resolution
  * provenance recording in `event_log`

### Database tables

Recommended MVP tables:

* `projects`
* `departments`
* `tasks`
* `event_log`
* `agent_keys`
* `agent_permissions`
* `app_settings`

## 10. Suggested Data Model

### `projects`

* `id uuid pk`
* `name text unique`
* `slug text unique`
* `is_archived boolean`
* `created_at timestamptz`
* `created_by uuid`

### `departments`

* `id uuid pk`
* `name text unique`
* `slug text unique`
* `is_archived boolean`
* `created_at timestamptz`
* `created_by uuid`

### `tasks`

* `id uuid pk`
* `project_id uuid fk projects`
* `department_id uuid fk departments null`
* `priority text`
* `description text`
* `notes text null`
* `due_date timestamptz null`
* `status text`
* `version integer default 1`
* `created_at timestamptz`
* `updated_at timestamptz`
* `created_by_type text`
* `created_by_id text`
* `updated_by_type text`
* `updated_by_id text`
* `source text`

### `event_log`

Unified, append-only event log for task provenance and admin audit trail. No UPDATE or DELETE grants.

* `id uuid pk`
* `event_category text` — `task` | `admin` | `system`
* `target_type text` — `task` | `agent_key` | `project` | `department`
* `target_id uuid` (the entity being acted on)
* `event_type text`
* `field_name text null`
* `old_value jsonb null`
* `new_value jsonb null`
* `actor_type text`
* `actor_id text`
* `actor_label text`
* `source text`
* `created_at timestamptz`

### `agent_keys`

* `id uuid pk`
* `name text`
* `role text default 'worker'` — `worker` | `manager`
* `key_hash text` (SHA-256)
* `key_prefix text` (first 8 chars of secret, for display)
* `is_active boolean`
* `special_prompt text null`
* `created_at timestamptz`
* `last_used_at timestamptz null`
* `created_by uuid`

### `agent_permissions`

* `id uuid pk`
* `agent_key_id uuid fk agent_keys`
* `project_id uuid fk projects`
* `department_id uuid fk departments null`
* `can_read boolean`
* `can_create boolean`
* `can_update boolean`
* `created_at timestamptz`

### `app_settings`

* `id uuid pk`
* `department_required boolean`
* `require_human_approval_for_agent_keys boolean default false`
* `created_at timestamptz`
* `updated_at timestamptz`

## 11. API Requirements

Minimum internal API surface:

* `GET /api/projects`
* `POST /api/projects`
* `PATCH /api/projects/:id`
* `GET /api/departments`
* `POST /api/departments`
* `PATCH /api/departments/:id`
* `GET /api/tasks`
* `POST /api/tasks`
* `PATCH /api/tasks/:id`
* `GET /api/tasks/:id/history` (reads from `event_log` filtered by task)
* `GET /api/agent-keys`
* `POST /api/agent-keys`
* `PATCH /api/agent-keys/:id`
* `POST /api/agent-keys/:id/rotate`
* `GET /api/event-log` (admin/manager access)

> **Implementation note:** The human-facing API uses Next.js Server Actions for mutations (POST/PATCH operations) and Route Handlers for reads (GET operations). This is the idiomatic Next.js App Router pattern. The REST endpoints listed above are implemented as: GET routes via `/api/*` Route Handlers, mutations via Server Actions in `src/app/(dashboard)/actions/`.

* `GET /api/mcp/info`
* `POST /api/mcp/get_tasks`
* `POST /api/mcp/add_task`
* `POST /api/mcp/update_task`
* `POST /api/mcp/manage_agent_keys`
* `POST /api/mcp/manage_agent_permissions`
* `POST /api/mcp/get_provenance`
* `POST /api/mcp/manage_projects`
* `POST /api/mcp/manage_departments`

## 12. Validation Rules

### Task validation

* `project_id` required
* `description` required, min length 3
* `priority` must be allowed enum
* `status` must be allowed enum
* `department_id` must be valid if provided
* `department_id` required only if `department_required = true`
* `due_date` must be valid timestamp if provided
* `version` required on update (must match current version)

### Permission validation

* Agent must be active
* Matching scope must exist for requested operation
* Project must not be archived (for task creation)
* Department must not be archived if specified (for task creation)
* Cross-scope department moves require authorization in both source and destination scope

## 13. Provenance Rules

* All create/update operations generate event log records.
* All admin operations (key management, permission changes, project/department management) generate event log records.
* Batch updates are out of scope for MVP.
* Every event row must identify actor and source.
* The `event_log` table is append-only — no UPDATE or DELETE grants.

## 14. Error Handling

MCP/API errors should be explicit and machine-readable. Each error includes recovery guidance telling the agent what to do next.

Error codes:

* `unauthorized_agent_key` — "Provide a valid API key in the Authorization header."
* `inactive_agent_key` — "This key has been deactivated. Contact the workspace admin."
* `scope_not_allowed` — "To access this project, the key must have read permission for project 'proofcodec'. Contact the workspace admin."
* `invalid_project` — "Project 'foo' not found. Call the info tool to see your valid projects."
* `invalid_department` — "Department 'bar' not found. Call the info tool to see valid departments."
* `task_not_found` — "Task not found or not in your allowed scope. Verify the task ID and your permissions."
* `update_not_allowed` — "This key cannot update tasks in this scope. Contact the workspace admin."
* `validation_error` — includes `fields` object detailing which fields failed and why.
* `version_conflict` — "Task was modified by another agent. Re-read the task using get_tasks, then retry your update with the new version number." Includes `current_version` field.
* `rate_limited` — "Too many requests. Retry after the specified interval." Includes `retry_after` field (seconds).
* `insufficient_manager_scope` — "Cannot grant permission that exceeds your own scope. Each granted row must be dominated by a single row you hold."
* `self_modification_denied` — "Cannot modify your own key, permissions, or role."

Response format example:

```json
{
  "error": {
    "code": "scope_not_allowed",
    "message": "This agent key cannot update tasks in project 'proofcodec', department 'legal'.",
    "recovery": "Contact the workspace admin to request update permission for this scope."
  }
}
```

## 15. Security Requirements

* Store only hashed API keys (SHA-256).
* Show full secret only once on creation/rotation.
* Enforce authorization server-side only.
* Log agent key usage timestamp.
* Use Supabase RLS for human-facing tables where practical, but do not rely on RLS alone for agent authorization. Edge functions remain authoritative.
* Avoid returning inaccessible project or department names to agents unless needed in `info`.
* Manager agents cannot escalate privileges beyond their own scope.
* Only humans can assign the manager role.

## 16. Observability for MVP

Minimum logging:

* request ID
* agent key ID
* tool/action name
* authorization result
* task ID when relevant
* error code when relevant
* latency

## 17. Success Metrics

### Product success

* Owner can manage all current project tasks outside Airtable.
* At least 2-3 internal agents can reliably use MCP without manual correction most of the time.
* Permission scoping prevents obvious cross-project mistakes.
* Provenance is sufficient to answer "who changed this and why?"
* Manager agents can handle routine key/permission administration without human intervention.

### Technical success

* Task creation/update round trip p95 < 500ms.
* Zero cases of unauthorized cross-scope task mutation.
* All task mutations produce event log rows.
* Version conflicts are detected and reported (no silent overwrites).

## 18. MVP Acceptance Criteria

### UI

* User can create project and department from sidebar flow.
* User can filter tasks by project and department.
* User can create, edit, and view tasks in table UI.
* User can inspect task history (via event log filtered by task).
* User can create and manage agent keys and permissions.
* User can set agent key role to manager.

### Worker MCP

* `info` returns permissions, role, and special prompt.
* `get_tasks` returns only allowed tasks with pagination support.
* `add_task` creates tasks only in allowed scopes.
* `update_task` updates tasks only in allowed scopes, with version-based concurrency control.
* Tool descriptions or schemas reflect valid project/department values for the current agent where possible.
* Worker agents see only worker tools in `tools/list`.

### Manager MCP

* `manage_agent_keys` can list/create/update/deactivate worker keys.
* `manage_agent_permissions` can set permissions bounded by manager's own scope (per-row subset constraint).
* `get_provenance` can read event log for allowed projects.
* `manage_projects` can create/rename/archive projects.
* `manage_departments` can create/rename/archive departments.
* Manager agents see both worker and manager tools in `tools/list`.
* All manager actions produce event log records.

### Security and provenance

* API keys are hashed at rest (SHA-256).
* Unauthorized operations are blocked.
* Every task mutation has provenance.
* Version conflicts are detected and rejected with actionable error.
* Manager scope constraints are enforced (per-row subset, no self-modification).

## 19. Open Questions

### Decided

1. Departments are global catalog (not project-specific) for MVP.
2. Agents cannot change project on update.
3. Notes are replaceable text field in MVP, append-only agent logs deferred.

### Open

4. Should read permission imply visibility in `info` even if create/update are not allowed? Recommended: yes.
5. Should `get_tasks` require explicit project param always? Recommended: yes for clarity, even if single project allowed.
6. Should owners support multiple human users in MVP? Resolved: MVP is single-owner per workspace. The `workspace_members` table supports multi-member expansion later.
7. Should agent keys created by managers require human approval before activation? Recommended: yes, configurable via `app_settings`.
8. Should managers be able to rotate other agents' keys? Recommended: yes, with provenance.
9. Max agent keys per manager? Recommended: configurable, default 20.

## 20. Recommended Decisions for MVP

* Project required, department optional.
* Global department catalog.
* Simple allow-only permissions.
* One human-admin workspace.
* Four worker MCP tools + five manager MCP tools.
* No delete operation for tasks in MVP, use `cancelled` instead.
* No task dependencies or subtasks.
* No batch operations.
* SHA-256 for API key hashing (not bcrypt).
* Optimistic concurrency via `version` field.
* Unified `event_log` for task provenance and admin audit.

## 21. Future Extensions, Not in MVP

* append-only agent work logs
* task claiming / leasing
* dependencies and subtasks
* workflow rules by department
* webhooks
* Slack/Telegram notifications
* richer policy model with explicit deny or field-level permissions
* multiple workspaces / organizations
* analytics per agent
* import from Airtable/Jira/Linear
* comments and attachments
* API key rotation overlap periods / expiration policies / M2M OAuth
* `correlation_id` for multi-tool request tracing
* `request_id` idempotency (requires separate storage table)
* granular `agent_admin_capabilities` table (role field sufficient for MVP)
* data retention policies for event log

## 22. Build Plan, Suggested Order

### Phase 1, data and auth

* Create schema for projects, departments, tasks, event_log, agent_keys, agent_permissions.
* Implement human auth with Supabase Auth.
* Implement agent key generation with compound format (`wb_<key_id>_<secret>`) and SHA-256 hashing.

### Phase 2, task APIs

* Implement project/department CRUD.
* Implement task create/list/update with optimistic concurrency (`version` field).
* Implement provenance recording in `event_log`.

### Phase 3, worker MCP tools

* Implement `info`, `get_tasks`, `add_task`, `update_task`.
* Add agent-scoped validation and dynamic schema description.
* Implement Streamable HTTP transport.

### Phase 3.5, manager MCP tools

* Implement `manage_agent_keys`, `manage_agent_permissions`.
* Implement `get_provenance`, `manage_projects`, `manage_departments`.
* Implement role-based tool visibility in `tools/list`.
* Implement per-row subset constraint for permission grants.

### Phase 4, UI

* Build sidebar.
* Build tasks table.
* Build task create/edit flow.
* Build history panel (reading from `event_log`).
* Build agent keys admin page (with role selection, key prefix display).

### Phase 5, hardening

* Logging
* request IDs
* archived entity behavior
* edge-case validation
* rate limiting

## 23. Summary

This MVP should be intentionally narrow: a reliable task registry for agents across multiple projects, with scoped permissions, minimal UI, MCP access, and full provenance. The point is not to compete with Jira or Linear. The point is to replace Airtable for an agent-heavy workflow with a system that has a better domain model, cleaner permissions, and machine-friendly behavior. Manager agents reduce operator burden for routine administration while maintaining strict scope constraints and audit trails.
