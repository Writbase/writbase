# Core Concepts

## Design Principles

1. **Agent-first** — API and MCP design matter more than UI polish
2. **Scoped by default** — Project is mandatory, department is recommended
3. **Explicit permissions** — No implicit broad access for agents
4. **Auditable** — Every meaningful change has provenance
5. **Minimal surface area** — Small number of entities, small number of operations
6. **Deterministic behavior** — MCP responses are predictable and easy for agents to consume

## Data Model

### Projects and Departments

- Every task belongs to exactly one **project**
- Tasks optionally belong to a **department** (global catalog, shared across projects)
- Projects and departments can be archived (blocks new task creation, existing tasks remain)

### Tasks

- Required: `project`, `description` (min 3 chars)
- Optional: `department`, `priority`, `notes`, `due_date`, `status`
- Status: `todo` (default), `in_progress`, `blocked`, `done`, `cancelled`, `failed`
- Priority: `low`, `medium` (default), `high`, `critical`
- Each task has a `version` field for optimistic concurrency control

### Agent Keys

Agent keys use a compound credential format: `wb_<key_id>_<secret>`

- `wb_` — fixed prefix identifying a WritBase key
- `<key_id>` — UUID of the key record (used for single-query lookup)
- `<secret>` — high-entropy random string (SHA-256 hashed at rest)

The full key is shown only once on creation. Only the hash and an 8-char prefix are stored.

**Roles:**
- `worker` — can use task tools within permitted scopes
- `manager` — all worker capabilities plus admin tools, bounded by own scope

## Permission Model

Permissions are granted per `(agent_key, project, department)` tuple with five capabilities:

| Capability | Description |
|------------|-------------|
| `can_read` | List and view tasks in scope |
| `can_create` | Create new tasks in scope |
| `can_update` | Modify any field on tasks in scope |
| `can_assign` | Create tasks in other departments via assign_task |
| `can_comment` | Restricted update: only `notes` and `status` changes |

### Scoping Rules

- If `department` is NULL in a permission row, the permission applies to the **entire project**
- Department-specific rows narrow scope to that department only
- Any matching allow rule grants the requested action (no deny rules)
- Workers see only task tools; managers also see admin tools in `tools/list`

### Manager Delegation

Managers can create worker keys and grant permissions, subject to:

- **Per-row subset constraint**: Each permission row granted must be individually dominated by a single row the manager holds (same project, same-or-broader department, actions are a subset)
- **No self-modification**: Cannot alter own key, permissions, or role
- **Workers only**: Cannot create other manager keys

### Cross-Scope Department Moves

Changing a task's department via `update_task` requires authorization in **both** the source and destination scope (source needs `can_update`, destination needs `can_create` or `can_update`).

### Managing Permissions via CLI

Operators can grant, revoke, and list permissions from the command line:

```bash
writbase key permit <name>                                          # list permissions
writbase key permit <name> --grant --project <slug> --can-assign    # additive grant
writbase key permit <name> --revoke --project <slug> --department <slug>  # revoke row
```

Grants are additive: `--grant --can-assign` on a key that already has `can_read` preserves `can_read`. Use `--no-can-read` to explicitly remove a flag.

## Provenance

All task mutations and admin actions produce entries in an append-only `event_log`:

- **Task events**: created, updated, status changed, priority changed, archived, unarchived
- **Admin events**: key created/deactivated, permissions granted/revoked, project/department created/archived

Each event records the actor (human or agent), source (`ui`, `mcp`), timestamp, and field-level old/new values.

## Error Handling

MCP errors include a machine-readable code, human message, and recovery guidance:

```json
{
  "error": {
    "code": "scope_not_allowed",
    "message": "This agent key cannot update tasks in project 'my-project', department 'ops'.",
    "recovery": "Contact the workspace admin to request update permission for this scope."
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `unauthorized_agent_key` | Invalid API key |
| `inactive_agent_key` | Key has been deactivated |
| `scope_not_allowed` | No permission for requested project/department |
| `invalid_project` | Project not found (call `info` to see valid projects) |
| `invalid_department` | Department not found |
| `task_not_found` | Task doesn't exist or isn't in allowed scope |
| `update_not_allowed` | No update permission in this scope |
| `version_conflict` | Task was modified since last read — re-read and retry |
| `validation_error` | Input validation failed (includes per-field details) |
| `rate_limited` | Too many requests (includes `retry_after` seconds) |
| `insufficient_manager_scope` | Cannot grant permissions exceeding own scope |
| `self_modification_denied` | Cannot modify own key/permissions/role |

## Cross-Department Task Assignment

The `assign_task` tool creates tasks in departments where the caller has `can_assign` permission. This is how agents create work in another team's queue.

```
# Create work in the frontend team's queue
writbase:assign_task { "project": "my-app", "department": "frontend", "description": "..." }
```

Rules:
- Department is **required** — you're assigning to a specific team
- Checks `can_assign` permission (not `can_create`)
- Same fields as `add_task` (project, department, description, priority, notes, due_date, status)
- Provenance (who requested the task) is tracked via `event_log` actor fields
- `can_comment`-only agents cannot use `assign_task` — requires `can_assign`
