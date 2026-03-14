---
name: worker
description: Patterns for working with WritBase task management MCP tools (writbase:info, writbase:get_tasks, writbase:get_top_tasks, writbase:add_task, writbase:update_task). Use when connected to a WritBase MCP server.
---

# WritBase Worker Patterns

## Session Start

Always begin a session by calling `writbase:info`. This returns:

- Your agent name, role, home project, and home department
- Your permission scopes (which projects/departments you can access and what actions are allowed)
- A `special_prompt` field with workspace-specific instructions -- follow these if present

Do not skip this step. Your permissions determine which tools will succeed.

## Tool Selection

| Goal | Tool | Notes |
|------|------|-------|
| "What should I work on?" | `writbase:get_top_tasks` | Priority-sorted, excludes done/cancelled/failed/blocked by default, max 25 (default 10) |
| Browse/filter/search tasks | `writbase:get_tasks` | Supports status, priority, department, search, date filters, pagination |
| Create a task | `writbase:add_task` | Requires `can_create` permission |
| Update a task | `writbase:update_task` | Requires `can_update` or `can_comment` permission |

## Compact vs Verbose Shape

By default, task queries return a compact 9-field shape:

`id`, `version`, `status`, `priority`, `description`, `due_date`, `department`, `created_at`, `updated_at`

Set `verbose: true` only when you need additional fields: `notes`, `assigned_to_agent_key_id`, `requested_by_agent_key_id`, `delegation_depth`, `assignment_chain`, `project_id`, `is_archived`, or full audit metadata.

## Version Conflict Handling

`writbase:update_task` uses optimistic concurrency. You must pass the `version` number from your last fetch:

1. Fetch the task (via `writbase:get_tasks` or `writbase:get_top_tasks`)
2. Pass the returned `version` value when calling `writbase:update_task`
3. On `version_conflict` error, re-fetch the task and retry with the `current_version` from the error response
4. Retry up to 3 times before reporting a conflict to the user

## Validation Rules

- `description`: minimum 3 characters
- `priority`: one of `low`, `medium`, `high`, `critical`
- `status`: one of `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `failed`
- `due_date`: valid ISO 8601 string (`YYYY-MM-DD` or `YYYY-MM-DDThh:mm:ssZ`)

## Department Scoping

- `writbase:add_task` without a `department` param requires project-wide `can_create` (a permission row with `department_id` = null)
- `writbase:update_task` checks permissions against the task's current department, not the new one
- With only `can_comment` permission: you can change `notes` and `status` only -- changes to `priority`, `description`, `department`, `due_date`, or `assign_to` are rejected

## Error Recovery Quick Reference

| Error | Action |
|-------|--------|
| `version_conflict` | Re-fetch the task, retry with `current_version` from the error |
| `rate_limited` | Wait `retry_after` seconds, then retry |
| `scope_not_allowed` | Check your permissions with `writbase:info` |
| `invalid_assignee` | Verify the agent name or key ID is correct and active |
| `validation_error` | Read the `fields` object for per-field error messages |
| `task_not_found` | Verify the task ID and your read access |

See [error-handling.md](references/error-handling.md) for the full error code reference.

## Example Workflows

### 1. Session start, pick up work, complete a task

```
# Step 1: Learn your context
writbase:info {}

# Step 2: Find top priority work
writbase:get_top_tasks { "project": "my-project" }

# Step 3: Mark a task in progress (use version from step 2)
writbase:update_task {
  "task_id": "abc-123",
  "version": 4,
  "status": "in_progress"
}

# Step 4: Complete the task after doing the work
writbase:update_task {
  "task_id": "abc-123",
  "version": 5,
  "status": "done",
  "notes": "Implemented the feature and verified tests pass."
}
```

### 2. Adding a task with department

```
writbase:add_task {
  "project": "my-project",
  "department": "engineering",
  "description": "Add rate limiting to the /api/upload endpoint",
  "priority": "high",
  "due_date": "2026-03-20"
}
```

### 3. Version conflict retry pattern

```
# First attempt -- fails because another agent updated the task
writbase:update_task {
  "task_id": "abc-123",
  "version": 4,
  "status": "done"
}
# Error: { "code": "version_conflict", "current_version": 5 }

# Re-fetch to see what changed
writbase:get_tasks { "project": "my-project", "search": "abc-123" }
# Returns task with version: 5

# Retry with correct version
writbase:update_task {
  "task_id": "abc-123",
  "version": 5,
  "status": "done"
}
```
