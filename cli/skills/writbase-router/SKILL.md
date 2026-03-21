---
name: writbase-router
description: Route task, writbase, agent, permission, provenance, webhook, and delegation requests to WritBase MCP tools. Triggers on keywords like task, writbase, work, assign, delegate, permission, audit, webhook, subscribe, provenance, agent key.
---

# WritBase Router

You are connected to a WritBase MCP server. This skill routes user intent to the correct WritBase tool or recipe.

## Session Gate

If you have not called `writbase:info` in this conversation, call it now before doing anything else. The response tells you your agent name, role, permissions, and any `special_prompt` instructions you must follow.

## Intent Routing

Match the user's request to one of these categories and execute directly:

### Direct execution (call the tool yourself)

| User says | Tool | Key params |
|-----------|------|------------|
| "what should I work on" / "next task" / "top tasks" / "priorities" | `writbase:get_top_tasks` | `project` (from info) |
| "create task" / "add task" / "new task" / "track this" | `writbase:add_task` | `project`, `description` (required) |
| "update task" / "mark done" / "complete" / "set status" / "block" | `writbase:update_task` | `task_id`, `version` (required) |
| "assign task" / "delegate" / "send to [team]" | `writbase:assign_task` | `project`, `department`, `description` (required) |
| "search tasks" / "find task" / "list tasks" / "filter" / "show tasks" | `writbase:get_tasks` | `project` (required), filters optional |
| "who am I" / "my permissions" / "info" / "status" | `writbase:info` | none |

For these operations, execute the tool call directly. Do not invoke `/writbase-recipes`.

### Dispatch to recipes (complex/manager operations)

| User says | Invoke |
|-----------|--------|
| "manage keys" / "create agent" / "new agent" / "rotate key" / "deactivate" | `/writbase-recipes` with context: "agent key management" |
| "permissions" / "grant" / "revoke" / "permission audit" | `/writbase-recipes` with context: "permission management" |
| "subscribe" / "webhook" / "notifications" | `/writbase-recipes` with context: "webhook subscription" |
| "audit" / "provenance" / "history" / "event log" | `/writbase-recipes` with context: "provenance query" |
| "discover agents" / "list agents" / "who else" | `/writbase-recipes` with context: "agent discovery" |
| "create project" / "manage project" / "archive project" | `/writbase-recipes` with context: "project management" |
| "create department" / "manage department" | `/writbase-recipes` with context: "department management" |

For these operations, invoke the Skill tool with `skill: "writbase-recipes"` and pass the user's request as args.

## Param Defaults

- `project`: Use agent's home project from `writbase:info` if only one project is available. If multiple, ask.
- `department`: Use agent's home department if set. If `department_required` is true, always include it.
- `priority`: Omit to default to `medium`. Only set if user specifies urgency.
- `status`: Omit to default to `todo` for new tasks. For updates, only set if user requests a status change.

## Error Handling

- `version_conflict`: re-fetch the task, retry with `current_version` from the error. Up to 3 retries.
- `rate_limited`: wait `retry_after` seconds before retrying. Do not retry immediately.
- `scope_not_allowed`: tell the user which permission is missing. Do not retry.
- `validation_error`: read the `fields` object, fix the invalid fields, retry.
- `task_not_found`: confirm the task UUID with the user. Check read access.

## Update Safety

For `update_task`, you must have the task's current `version`. If you do not have it from a recent fetch, call `get_tasks` or `get_top_tasks` first. Never guess the version number.

Agents with only `can_comment` permission can change `notes` and `status` only. Do not attempt to change `priority`, `description`, `department`, `due_date`, or `is_archived` for these agents.

## Ambiguous Requests

If the user's intent is unclear, ask one clarifying question. Do not guess between create vs. update, or between `add_task` vs. `assign_task`. Key distinction: `add_task` creates in your own scope; `assign_task` creates in another team's department and requires `can_assign` permission.
