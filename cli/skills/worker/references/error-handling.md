# WritBase Error Code Reference

All WritBase MCP tool errors return a JSON object with the following shape:

```json
{
  "code": "error_code_string",
  "message": "Human-readable description",
  "recovery": "Suggested recovery action",
  "fields": {},
  "current_version": null,
  "retry_after": null
}
```

Optional fields (`fields`, `current_version`, `retry_after`) are present only for specific error codes.

---

## Authentication Errors

### `unauthorized_agent_key`

- **Message**: Invalid or missing agent key.
- **Recovery**: Provide a valid agent key in the Authorization header as `Bearer wb_<key_id>_<secret>`.
- **Notes**: This is a transport-level error. If you see this, your MCP connection is misconfigured.

### `inactive_agent_key`

- **Message**: This agent key has been deactivated.
- **Recovery**: Contact an admin to reactivate the key or provision a new one.
- **Notes**: Keys pending human approval also return this error until activated.

---

## Permission Errors

### `scope_not_allowed`

- **Message**: Agent does not have "{action}" permission for project "{project}".
- **Recovery**: Request the needed permission from an admin. Operators can grant via CLI: `writbase key permit <agent-name> --grant --project <slug> --can-read` (or via the dashboard).
- **Notes**: Call `writbase:info` to see your current permission scopes.

### `update_not_allowed`

- **Message**: Update not allowed: {reason}.
- **Recovery**: Check agent permissions and task ownership rules.
- **Notes**: Returned when permission exists but the specific update is blocked (e.g., `can_comment` agent trying to change priority).

### `insufficient_manager_scope`

- **Message**: This action requires manager role.
- **Recovery**: Use a manager-level agent key to perform this action.
- **Notes**: Manager tools (`writbase:manage_agent_keys`, `writbase:manage_agent_permissions`, etc.) require `role: "manager"`.

### `self_modification_denied`

- **Message**: An agent cannot modify its own key.
- **Recovery**: Ask a different agent or a human admin to make this change.
- **Notes**: Applies to `writbase:manage_agent_keys` update/deactivate/rotate and `writbase:manage_agent_permissions` grant/revoke on your own key ID.

### `assign_not_allowed`

- **Message**: Agent does not have "assign" permission for project "{project}".
- **Recovery**: Request the `can_assign` permission from an admin. Operators can grant via CLI: `writbase key permit <agent-name> --grant --project <slug> --can-assign` (or via the dashboard).
- **Notes**: Separate from `can_create`. You need `can_assign` specifically to use the `assign_task` tool.

---

## Resource Errors

### `invalid_project`

- **Message**: Project "{slug}" does not exist or is archived.
- **Recovery**: Verify the project slug and ensure it is not archived.
- **Notes**: Check `writbase:info` output for your list of valid projects.

### `invalid_department`

- **Message**: Department "{slug}" does not exist or is archived.
- **Recovery**: Verify the department slug and ensure it is not archived.
- **Notes**: Department slugs are scoped to a project. Check `writbase:info` for valid departments.

### `task_not_found`

- **Message**: Task "{id}" was not found.
- **Recovery**: Verify the task ID is correct and that you have read access to its project.
- **Notes**: Could mean the task does not exist, or you lack `can_read` for its project/department.

---

## Validation and Rate Limiting

### `validation_error`

- **Message**: One or more fields failed validation.
- **Recovery**: Fix the listed fields and retry.
- **Extra fields**: `fields` -- an object mapping field names to error descriptions.

**Example error response:**

```json
{
  "code": "validation_error",
  "message": "One or more fields failed validation.",
  "recovery": "Fix the listed fields and retry.",
  "fields": {
    "description": "Description must be at least 3 characters.",
    "priority": "Priority must be one of: low, medium, high, critical."
  }
}
```

**Common mistakes:**

```
WRONG: { "description": "AB" }
RIGHT: { "description": "Fix the login bug" }

WRONG: { "priority": "urgent" }
RIGHT: { "priority": "critical" }

WRONG: { "due_date": "March 20, 2026" }
RIGHT: { "due_date": "2026-03-20" }

WRONG: { "status": "complete" }
RIGHT: { "status": "done" }
```

### `version_conflict`

- **Message**: The task was modified since you last read it.
- **Recovery**: Re-fetch the task to get the current version, then retry your update with the new version number.
- **Extra fields**: `current_version` -- the current version number of the task.

**Example error response:**

```json
{
  "code": "version_conflict",
  "message": "The task was modified since you last read it.",
  "recovery": "Re-fetch the task to get the current version, then retry your update with the new version number.",
  "current_version": 7
}
```

**Retry pattern:**

```
# Attempt 1: update with stale version
writbase:update_task { "task_id": "abc-123", "version": 5, "status": "done" }
# Error: version_conflict, current_version: 7

# Attempt 2: re-fetch, then retry with fresh version
writbase:get_tasks { "project": "my-project", "search": "abc-123" }
# Returns version: 7
writbase:update_task { "task_id": "abc-123", "version": 7, "status": "done" }
```

If the conflict persists after 3 retries, report it -- another agent may be actively modifying the same task.

### `rate_limited`

- **Message**: Rate limit exceeded.
- **Recovery**: Wait and retry after the indicated time.
- **Extra fields**: `retry_after` -- number of seconds to wait before retrying.

**Example error response:**

```json
{
  "code": "rate_limited",
  "message": "Rate limit exceeded.",
  "recovery": "Wait and retry after the indicated time.",
  "retry_after": 30
}
```

Wait the full `retry_after` duration before your next request. Do not retry immediately.
