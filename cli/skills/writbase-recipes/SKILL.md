---
name: writbase-recipes
description: "WritBase API recipes reference (internal)"
context: fork
---

# WritBase Recipes Reference

Consolidated reference for all WritBase MCP tools. This skill is invoked by `/writbase-router` for complex operations and serves as an API cookbook.

---

## 1. Session Start: `writbase:info`

Call with no parameters. Returns:

```json
{
  "agent": { "name": "...", "role": "worker|manager", "is_active": true, "project": "slug|null", "department": "slug|null" },
  "permissions": {
    "department_required": false,
    "scopes": [
      { "project": "my-proj", "department": "eng", "can_read": true, "can_create": true, "can_update": true, "can_assign": false, "can_comment": false, "can_archive": false }
    ]
  },
  "special_prompt": "Follow these instructions..."
}
```

**Interpreting the response:**
- `agent.role` determines tool access: `worker` gets 6 tools, `manager` gets all 12
- `agent.project` / `agent.department` are defaults -- use these when the user does not specify
- `permissions.scopes` lists every project/department grant. A scope with `department: null` is project-wide
- `permissions.department_required` -- if true, `add_task` requires a department parameter
- `special_prompt` -- if present, follow these instructions for the entire session

---

## 2. Task Retrieval

### `writbase:get_tasks` -- browse/filter/search

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug or UUID |
| `department` | string | no | Filter by department slug |
| `status` | enum | no | `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `failed` |
| `priority` | enum | no | `low`, `medium`, `high`, `critical` |
| `search` | string | no | Full-text search (supports AND/OR/NOT operators) |
| `updated_after` | string | no | ISO 8601 timestamp |
| `limit` | number | no | Max 50, default 20 |
| `cursor` | string | no | From previous `next_cursor` |
| `include_archived` | boolean | no | Default false |
| `verbose` | boolean | no | Default false (compact 9-field shape) |

**Compact shape** (default): `id`, `version`, `status`, `priority`, `description`, `due_date`, `department`, `created_at`, `updated_at`

**Verbose shape** adds: `notes`, `project_id`, `is_archived`, full audit metadata

**Pagination**: When `next_cursor` is present in the response, pass it as `cursor` to get the next page.

```
writbase:get_tasks { "project": "my-proj", "status": "todo", "priority": "high" }
writbase:get_tasks { "project": "my-proj", "search": "rate limiting", "limit": 5 }
writbase:get_tasks { "project": "my-proj", "cursor": "<next_cursor from prev>" }
```

### `writbase:get_top_tasks` -- priority-sorted actionable tasks

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug or UUID |
| `department` | string | no | Filter by department slug |
| `status` | enum | no | Override default exclusion filter |
| `limit` | number | no | Max 25, default 10 |
| `verbose` | boolean | no | Default false |

By default excludes `done`, `cancelled`, `failed`, `blocked`. Set `status` to override.

```
writbase:get_top_tasks { "project": "my-proj" }
writbase:get_top_tasks { "project": "my-proj", "department": "eng", "limit": 5 }
```

---

## 3. Task Creation: `writbase:add_task`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug or UUID |
| `department` | string | conditional | Required if `department_required` is true in workspace settings |
| `description` | string | yes | Min 3 chars |
| `priority` | enum | no | Default `medium`. Values: `low`, `medium`, `high`, `critical` |
| `status` | enum | no | Default `todo`. Values: `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `failed` |
| `notes` | string | no | Additional context |
| `due_date` | string | no | ISO 8601 (`YYYY-MM-DD` or `YYYY-MM-DDThh:mm:ssZ`) |
| `session_id` | string | no | Claude session ID for linking |

**Permission check:**
- With `department` param: requires `can_create` for that department scope
- Without `department` param: requires project-wide `can_create` (a permission row with `department_id = null`)

```
writbase:add_task {
  "project": "my-proj",
  "department": "eng",
  "description": "Add rate limiting to /api/upload",
  "priority": "high",
  "due_date": "2026-04-01"
}
```

---

## 4. Task Updates: `writbase:update_task`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `task_id` | string | yes | Task UUID |
| `version` | number | yes | From last fetch -- optimistic concurrency |
| `status` | enum | no | New status |
| `priority` | enum | no | New priority |
| `description` | string | no | Min 3 chars |
| `notes` | string | no | New notes (replaces, not appends) |
| `department` | string | no | Move task to new department |
| `due_date` | string | no | ISO 8601 |
| `is_archived` | boolean | no | Requires `can_archive` permission |
| `session_id` | string | no | Claude session ID |

**Permission check:**
- `can_update` allows changing all fields (except `is_archived` which needs `can_archive`)
- `can_comment` restricts to `notes` and `status` only -- attempting other fields returns `scope_not_allowed`
- Permission is checked against the task's **current** department, not the target department

### Version conflict retry pattern

```
# Attempt 1: update with version from earlier fetch
writbase:update_task { "task_id": "abc-123", "version": 4, "status": "done" }
# Error: { "code": "version_conflict", "current_version": 6 }

# Re-fetch to see current state
writbase:get_tasks { "project": "my-proj", "search": "abc-123" }
# Returns version: 6

# Attempt 2: retry with fresh version
writbase:update_task { "task_id": "abc-123", "version": 6, "status": "done" }
```

Retry up to 3 times. If still conflicting, report to the user -- another agent is actively modifying the task.

---

## 5. Task Assignment: `writbase:assign_task`

Creates a task in another team's queue. Separate from `add_task`.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug or UUID |
| `department` | string | yes | Target department (always required) |
| `description` | string | yes | Min 3 chars |
| `priority` | enum | no | Default `medium` |
| `status` | enum | no | Default `todo` |
| `notes` | string | no | Additional context |
| `due_date` | string | no | ISO 8601 |

**Permission check:** Requires `can_assign` (not `can_create`) for the target department scope.

```
writbase:assign_task {
  "project": "my-proj",
  "department": "frontend",
  "description": "Fix responsive layout on settings page",
  "priority": "high"
}
```

---

## 6. Manager Operations

All manager tools require `role: "manager"`. Worker keys receive `insufficient_manager_scope`.

### `writbase:manage_agent_keys`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `list` | -- | Paginated: `limit` (max 50), `cursor` |
| `create` | `name` | Returns `full_key` (shown once). Optional: `special_prompt`, `project_id`, `department_id` |
| `update` | `key_id` | Changeable: `name`, `special_prompt`, `is_active`, `project_id`, `department_id` |
| `deactivate` | `key_id` | Sets `is_active: false` immediately |
| `rotate` | `key_id` | New secret, old invalidated. Returns new `full_key` |

Constraints:
- Cannot modify your own key (`self_modification_denied`)
- If `require_human_approval_for_agent_keys` is enabled, new keys start inactive

```
# Create a worker key
writbase:manage_agent_keys {
  "action": "create",
  "name": "deploy-bot",
  "special_prompt": "You handle deployment tasks."
}
# Response: { "key_id": "...", "full_key": "wb_<key_id>_<secret>", ... }
# Store full_key securely -- shown only once
```

### `writbase:manage_agent_permissions`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `list` | `key_id` | All permission rows for target agent |
| `grant` | `key_id`, `permissions` | Upserts (idempotent on project+department) |
| `revoke` | `key_id`, `permissions` | Deletes matching rows |

Permission flags per row: `can_read`, `can_create`, `can_update`, `can_assign`, `can_comment`, `can_archive`

**Dominance rule**: A single row of your permissions must be a superset of each granted row. Permissions are never combined across your rows.

```
# Grant read + create for a specific department
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<target-key-id>",
  "permissions": [{
    "project_id": "<uuid>",
    "department_id": "<uuid>",
    "can_read": true,
    "can_create": true
  }]
}
```

### `writbase:manage_projects`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `name` | Auto-generates slug |
| `rename` | `project_id`, `name` | Updates display name |
| `archive` | `project_id` | Permissions become inert |

### `writbase:manage_departments`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `name` | Auto-generates slug |
| `rename` | `department_id`, `name` | Updates display name |
| `archive` | `department_id` | Hides from active views |

---

## 7. Webhooks: `writbase:subscribe`

Manager only. HMAC-SHA256 signed payloads.

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `project`, `url` | HTTPS only. Optional `event_types` (default: `["task.completed"]`) |
| `list` | -- | All subscriptions for your agent key |
| `delete` | `subscription_id` | Removes subscription |

Valid event types: `task.created`, `task.updated`, `task.completed`, `task.failed`

```
writbase:subscribe {
  "action": "create",
  "project": "my-proj",
  "url": "https://example.com/webhook",
  "event_types": ["task.created", "task.completed"]
}
# Response includes `secret` for HMAC verification -- store securely, shown only once
```

---

## 8. Provenance: `writbase:get_provenance`

Manager only. Queries the append-only event log.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug |
| `target_type` | enum | no | `task`, `agent_key`, `project`, `department` |
| `event_category` | enum | no | `task`, `admin`, `system` |
| `limit` | number | no | Max 50, default 20 |
| `cursor` | string | no | Pagination cursor |

```
# All task events in a project
writbase:get_provenance { "project": "my-proj", "target_type": "task" }

# Admin events only (key/permission changes)
writbase:get_provenance { "project": "my-proj", "event_category": "admin" }

# Paginate through history
writbase:get_provenance { "project": "my-proj", "cursor": "<next_cursor>" }
```

---

## 9. Agent Discovery: `writbase:discover_agents`

Manager only. Lists active agents with access to a project.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project slug |
| `skill` | string | no | Filter by declared skill/capability |

```
writbase:discover_agents { "project": "my-proj" }
writbase:discover_agents { "project": "my-proj", "skill": "coding" }
```

Returns agent name, role, last_used_at, and capabilities (skills, description, accepts_tasks).

---

## 10. Agent Provisioning Cookbook

### Single-project worker

```
# 1. Create key
writbase:manage_agent_keys { "action": "create", "name": "build-agent", "special_prompt": "Handle CI tasks." }

# 2. Grant permissions (use project UUID from info)
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<key_id>",
  "permissions": [{ "project_id": "<uuid>", "can_read": true, "can_create": true, "can_update": true }]
}

# 3. Verify
writbase:discover_agents { "project": "my-proj" }
```

### Cross-department agent

Grant separate rows per department -- each row is evaluated independently:

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<key_id>",
  "permissions": [
    { "project_id": "<uuid>", "department_id": "<intake-uuid>", "can_read": true, "can_update": true },
    { "project_id": "<uuid>", "department_id": "<eng-uuid>", "can_read": true, "can_create": true }
  ]
}
```

### Comment-only observer

Grant `can_read` + `can_comment` (no `can_update`). Agent can change `notes` and `status` but nothing else:

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<key_id>",
  "permissions": [{ "project_id": "<uuid>", "can_read": true, "can_comment": true }]
}
```

### Delegation coordinator

Grant `can_assign` for cross-department task creation via `assign_task`:

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<key_id>",
  "permissions": [{ "project_id": "<uuid>", "can_read": true, "can_create": true, "can_update": true, "can_assign": true }]
}
```

---

## 11. Error Recovery

See [error-codes.md](references/error-codes.md) for the complete error reference.

Quick recovery table:

| Error Code | Immediate Action |
|------------|-----------------|
| `rate_limited` | Wait `retry_after` seconds, then retry |
| `version_conflict` | Re-fetch task, retry with `current_version` (up to 3x) |
| `scope_not_allowed` | Call `writbase:info` to check permissions. Tell user what is missing |
| `validation_error` | Read `fields` object for per-field errors. Fix and retry |
| `task_not_found` | Verify task UUID and read access |
| `unauthorized_agent_key` | MCP config error -- check `.mcp.json` key |
| `inactive_agent_key` | Key deactivated -- admin must reactivate or create new key |
| `invalid_project` | Check available projects via `writbase:info` |
| `invalid_department` | Check available departments via `writbase:info` |
| `insufficient_manager_scope` | Operation requires manager role -- use a manager key |
| `self_modification_denied` | Cannot modify own key -- use a different agent or human admin |
| `assign_not_allowed` | Need `can_assign` permission for `assign_task` |
| `update_not_allowed` | Permission exists but specific update blocked (e.g. comment-only agent changing priority) |
| `department_required` | Workspace requires department -- provide `department` parameter |

---

## 12. Validation Quick Reference

| Field | Constraint |
|-------|-----------|
| `description` | Min 3 characters |
| `priority` | `low`, `medium`, `high`, `critical` |
| `status` | `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `failed` |
| `due_date` | ISO 8601: `YYYY-MM-DD` or `YYYY-MM-DDThh:mm:ssZ` |
| `url` (webhooks) | Must be HTTPS |
| `project` / `department` | Slug string or UUID |

See [permission-model.md](references/permission-model.md) for permission scoping rules.
