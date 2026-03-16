# WritBase Permission Model

## Permission Grant Structure

Each permission row contains:

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
- `department_id` is optional -- when null, the permission applies project-wide
- All boolean flags default to `false` if omitted

## Dominance Check Rules

When a manager grants permissions to another agent, the system verifies that the manager's own permissions are a superset. This is the **dominance check**.

### Key principle: single-row dominance

A single row of the manager's permissions must fully cover each granted row. Permissions are **never combined across the manager's rows**.

### Rules evaluated per granted row:

1. **Same project**: The manager must have a permission row for the same `project_id`
2. **Department coverage**: The manager's row must have `department_id = null` (project-wide) or the same `department_id` as the granted row
3. **Action superset**: Every `true` flag in the granted row must also be `true` in the manager's covering row

### Examples

**Manager has:**
```
Row A: { project_id: "P1", department_id: null, can_read: true, can_create: true, can_update: true }
```

**Granting to worker:**
```
CORRECT: { project_id: "P1", department_id: "D1", can_read: true, can_create: true }
  -- Row A covers this (project-wide includes all departments, read+create are both true)

WRONG: { project_id: "P1", department_id: "D1", can_read: true, can_assign: true }
  -- Row A does not have can_assign, so dominance check fails
```

**Manager has two rows:**
```
Row A: { project_id: "P1", department_id: "D1", can_read: true, can_create: true }
Row B: { project_id: "P1", department_id: "D2", can_read: true, can_update: true }
```

**Granting to worker:**
```
WRONG: { project_id: "P1", department_id: "D1", can_read: true, can_update: true }
  -- Row A has D1 but no can_update. Row B has can_update but is scoped to D2.
  -- No single row covers both D1 + can_update. Dominance check fails.

CORRECT: { project_id: "P1", department_id: "D1", can_read: true, can_create: true }
  -- Row A covers this entirely.

CORRECT: { project_id: "P1", department_id: "D2", can_read: true, can_update: true }
  -- Row B covers this entirely.
```

## `can_comment` as Restricted Update

`can_comment` is intentionally separate from `can_update`. An agent with only `can_comment`:

- **Can change**: `notes`, `status`
- **Cannot change**: `priority`, `description`, `department`, `due_date`, `is_archived`

Use `can_comment` for agents that should report progress (e.g., set status to `done` and add completion notes) but should not modify task scope or reassign work.

An agent with `can_update` can change all task fields (except archiving, which requires `can_archive`).

## Department Scoping Per Action

### `writbase:add_task`

- With `department` param: checks `can_create` for that specific department
- Without `department` param: requires project-wide `can_create` (a permission row with `department_id = null`)

```
WRONG setup: Agent has can_create only for department "eng"
  writbase:add_task { "project": "my-project", "description": "New task" }
  -- Fails: no project-wide can_create

CORRECT: Either specify the department:
  writbase:add_task { "project": "my-project", "department": "eng", "description": "New task" }

  Or grant project-wide can_create:
  { "project_id": "P1", "department_id": null, "can_create": true }
```

### `writbase:update_task`

Permission is checked against the task's **current** department, not the new department being set:

```
Task is currently in department "eng".
Agent has can_update for department "eng" only.

CORRECT: writbase:update_task { "task_id": "...", "version": 3, "department": "ops" }
  -- Allowed because the agent has can_update for the task's current department ("eng")

If the task were in department "ops", the same agent could NOT update it,
even though they are trying to move it to "eng" where they have permissions.
```

## Common Permission Mistakes

### Mistake: Granting more than you have

```
Manager has: { can_read: true, can_create: true }
Tries to grant: { can_read: true, can_create: true, can_update: true }
Result: insufficient_manager_scope error
```

### Mistake: Assuming rows combine

```
Manager has:
  Row 1: { project_id: "P1", can_read: true }
  Row 2: { project_id: "P1", can_create: true }

Tries to grant: { project_id: "P1", can_read: true, can_create: true }
Result: insufficient_manager_scope error
  -- Neither row alone covers both can_read AND can_create
```

### Mistake: Department mismatch

```
Manager has: { project_id: "P1", department_id: "D1", can_read: true, can_create: true }
Tries to grant: { project_id: "P1", department_id: "D2", can_read: true }
Result: insufficient_manager_scope error
  -- Manager's row is scoped to D1, cannot cover a grant for D2
```

### Correct: Project-wide covers all departments

```
Manager has: { project_id: "P1", department_id: null, can_read: true, can_create: true }
Tries to grant: { project_id: "P1", department_id: "D2", can_read: true }
Result: Success
  -- department_id: null means project-wide, which covers any specific department
```
