# WritBase Error Code Reference

All WritBase MCP tool errors return a JSON object:

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

- **Cause**: Invalid or missing agent key in Authorization header.
- **Recovery**: Verify the key in `.mcp.json` matches the format `Bearer wb_<key_id>_<secret>`. This is a transport-level error -- your MCP connection is misconfigured.

### `inactive_agent_key`

- **Cause**: Agent key has been deactivated, or is pending human approval.
- **Recovery**: Contact an admin to reactivate the key (`writbase:manage_agent_keys` action `update` with `is_active: true`) or provision a new key.

---

## Permission Errors

### `scope_not_allowed`

- **Cause**: Agent lacks the required permission (`can_read`, `can_create`, `can_update`, `can_assign`, `can_archive`) for the target project/department.
- **Recovery**: Call `writbase:info` to see current scopes. Request the missing permission from an admin. CLI: `writbase key permit <name> --grant --project <slug> --can-<permission>`.

### `update_not_allowed`

- **Cause**: Permission exists but the specific update is blocked. Most common: `can_comment` agent attempting to change `priority`, `description`, `department`, `due_date`, or `is_archived`.
- **Recovery**: Remove restricted fields. With `can_comment`, only `notes` and `status` changes are allowed.

### `insufficient_manager_scope`

- **Cause**: Tool requires `role: "manager"` but the current key is a worker.
- **Recovery**: Use a manager-level agent key. Manager tools: `manage_agent_keys`, `manage_agent_permissions`, `manage_projects`, `manage_departments`, `get_provenance`, `subscribe`, `discover_agents`.

### `self_modification_denied`

- **Cause**: Agent attempted to modify its own key (update, deactivate, rotate) or its own permissions.
- **Recovery**: Use a different agent key or a human admin to make the change.

### `assign_not_allowed`

- **Cause**: Agent lacks `can_assign` permission for the target project.
- **Recovery**: Request `can_assign` from an admin. Note: `can_assign` is separate from `can_create`. CLI: `writbase key permit <name> --grant --project <slug> --can-assign`.

---

## Resource Errors

### `invalid_project`

- **Cause**: Project slug/UUID does not exist, is archived, or agent has no permissions for it.
- **Recovery**: Check available projects via `writbase:info`. Verify the slug is correct and the project is not archived.

### `invalid_department`

- **Cause**: Department slug/UUID does not exist, is archived, or is not in the target project.
- **Recovery**: Check available departments via `writbase:info`. Department slugs are scoped to a project.

### `task_not_found`

- **Cause**: Task UUID does not exist, or agent lacks `can_read` for the task's project/department.
- **Recovery**: Verify the task ID. Confirm you have `can_read` access to the task's project.

---

## Validation and Concurrency Errors

### `validation_error`

- **Cause**: One or more fields failed validation.
- **Recovery**: Read the `fields` object for per-field error messages. Fix and retry.
- **Extra field**: `fields` -- object mapping field names to error descriptions.

Common mistakes:
- `description` shorter than 3 characters
- `priority` set to `"urgent"` instead of `"critical"`
- `status` set to `"complete"` instead of `"done"`
- `due_date` in non-ISO format (use `YYYY-MM-DD`, not `"March 20, 2026"`)

### `department_required`

- **Cause**: Workspace setting `department_required` is enabled but no `department` parameter was provided to `add_task`.
- **Recovery**: Provide the `department` parameter. Check available departments via `writbase:info`.

### `version_conflict`

- **Cause**: Task was modified by another agent since you last fetched it.
- **Recovery**: Re-fetch the task to get current state. Use the `current_version` from the error (or from the re-fetched task) in your retry. Retry up to 3 times.
- **Extra field**: `current_version` -- the task's actual current version number.

### `rate_limited`

- **Cause**: Too many requests in the current time window.
- **Recovery**: Wait exactly `retry_after` seconds before your next request. Do not retry immediately.
- **Extra field**: `retry_after` -- seconds to wait.

---

## Internal Errors

### `internal_error`

- **Cause**: Unexpected server-side error.
- **Recovery**: Report the error message to an admin. This indicates a bug or infrastructure issue. Do not retry automatically.
