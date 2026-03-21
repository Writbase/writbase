# WritBase Permission Model

## Permission Row Structure

Each permission row grants an agent a set of capabilities scoped to a project and optionally a department:

```json
{
  "project_id": "<uuid>",
  "department_id": "<uuid or null>",
  "can_read": false,
  "can_create": false,
  "can_update": false,
  "can_assign": false,
  "can_comment": false,
  "can_archive": false
}
```

- `project_id` is always required
- `department_id = null` means the permission applies project-wide (covers all departments)
- All boolean flags default to `false` if omitted

## The 6 Permission Types

| Permission | Allows |
|-----------|-------|
| `can_read` | View tasks via `get_tasks`, `get_top_tasks` |
| `can_create` | Create tasks via `add_task` |
| `can_update` | Modify all task fields via `update_task` (except `is_archived`) |
| `can_assign` | Create tasks in other departments via `assign_task` |
| `can_comment` | Restricted update: change only `notes` and `status` via `update_task` |
| `can_archive` | Change `is_archived` field via `update_task` |

### `can_comment` vs `can_update`

`can_comment` is a restricted form of update. An agent with only `can_comment` (no `can_update`):

- **Can change**: `notes`, `status`
- **Cannot change**: `priority`, `description`, `department`, `due_date`, `is_archived`

Use `can_comment` for agents that should report progress (mark done, add notes) but should not modify task scope. An agent with `can_update` can change all task fields.

### `can_archive` is separate

`can_update` does not grant archive access. To set `is_archived`, the agent must have `can_archive` for the task's project/department scope.

## Department Scoping Rules

### Project-wide vs department-specific

- `department_id = null` -- project-wide: covers all departments in the project
- `department_id = "<uuid>"` -- department-specific: covers only that department

### Scoping per tool

**`add_task`**:
- With `department` param: checks `can_create` for that specific department (or project-wide)
- Without `department` param: requires project-wide `can_create` (`department_id = null`)

**`update_task`**:
- Permission is checked against the task's **current** department, not the target department
- Example: task is in "eng", agent has `can_update` for "eng" only. The agent CAN move the task to "ops" because permission is checked against the current department.

**`assign_task`**:
- Checks `can_assign` for the target department scope
- Department is always required

## Dominance Rule (for `manage_agent_permissions`)

When a manager grants permissions, the system checks that the manager's own permissions are a superset. This is the dominance check.

### Single-row dominance

A **single row** of the manager's permissions must fully cover each granted row. Permissions are **never combined** across the manager's rows.

### Rules per granted row

1. **Same project**: Manager must have a permission row for the same `project_id`
2. **Department coverage**: Manager's row must have `department_id = null` (project-wide) or the same `department_id`
3. **Action superset**: Every `true` flag in the granted row must also be `true` in the manager's covering row

### Examples

Manager has one project-wide row:
```
Row A: { project_id: "P1", department_id: null, can_read: true, can_create: true, can_update: true }
```

- PASS: `{ project_id: "P1", department_id: "D1", can_read: true, can_create: true }` -- Row A covers (project-wide includes D1, read+create are true)
- FAIL: `{ project_id: "P1", department_id: "D1", can_read: true, can_assign: true }` -- Row A lacks `can_assign`

Manager has two department-specific rows:
```
Row A: { project_id: "P1", department_id: "D1", can_read: true, can_create: true }
Row B: { project_id: "P1", department_id: "D2", can_read: true, can_update: true }
```

- FAIL: `{ project_id: "P1", department_id: "D1", can_read: true, can_update: true }` -- Row A has D1 but no `can_update`. Row B has `can_update` but is D2. No single row covers both.
- PASS: `{ project_id: "P1", department_id: "D1", can_read: true, can_create: true }` -- Row A covers entirely
- PASS: `{ project_id: "P1", department_id: "D2", can_read: true, can_update: true }` -- Row B covers entirely

## Common Permission Mistakes

**Granting more than you have:**
Manager has `can_read` + `can_create`, tries to grant `can_update` -- fails with `insufficient_manager_scope`.

**Assuming rows combine:**
Manager has Row 1 (`can_read`) and Row 2 (`can_create`) for the same project. Tries to grant `can_read` + `can_create` in one row -- fails because neither row alone covers both.

**Department mismatch:**
Manager has permissions for D1, tries to grant for D2 -- fails. Project-wide (`department_id = null`) covers all departments.
