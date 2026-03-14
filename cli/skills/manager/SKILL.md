---
name: manager
description: Patterns for managing agents, permissions, projects, and departments in WritBase (writbase:manage_agent_keys, writbase:manage_agent_permissions, writbase:manage_projects, writbase:manage_departments, writbase:get_provenance, writbase:subscribe, writbase:discover_agents). Use when connected as a manager-role agent.
---

# WritBase Manager Patterns

All manager tools require `role: "manager"` on your agent key. Worker keys cannot access these tools.

## Agent Provisioning Flow

The standard sequence for onboarding a new agent:

1. **Create the key** with `writbase:manage_agent_keys` (action: `create`)
2. **Grant permissions** with `writbase:manage_agent_permissions` (action: `grant`)
3. **Verify** with `writbase:discover_agents` to confirm the agent appears with correct capabilities

Store the `full_key` from step 1 securely -- it is shown only once.

## Key Management

Use `writbase:manage_agent_keys` with these actions:

| Action | Required Params | Notes |
|--------|----------------|-------|
| `list` | -- | Paginated. Optional `limit` (max 50), `cursor` |
| `create` | `name` | Returns `full_key` (shown once). Optional: `special_prompt`, `project_id`, `department_id` |
| `update` | `key_id` | Update `name`, `special_prompt`, `is_active`, `project_id`, `department_id` |
| `deactivate` | `key_id` | Sets `is_active: false`. Immediate effect |
| `rotate` | `key_id` | Generates new secret. Old secret invalidated immediately. Returns new `full_key` |

Constraints:
- Managers can only create worker keys (not other managers)
- You cannot modify your own key (`self_modification_denied`)
- If `require_human_approval_for_agent_keys` is enabled in workspace settings, new keys start as inactive until an admin activates them

## Permission Management

Use `writbase:manage_agent_permissions` with these actions:

| Action | Required Params | Notes |
|--------|----------------|-------|
| `list` | `key_id` | Shows all permission rows for the target agent |
| `grant` | `key_id`, `permissions` | Upserts permission rows (idempotent on project+department) |
| `revoke` | `key_id`, `permissions` | Deletes matching permission rows |

Permission flags per row: `can_read`, `can_create`, `can_update`, `can_assign`, `can_comment`, `can_archive`.

### Dominance Rule

You can only grant permissions you yourself have. This is enforced per-row: a single row of your permissions must be a superset of each granted row. Permissions are never combined across your rows.

See [permission-model.md](references/permission-model.md) for detailed rules and examples.

### `can_comment` as Restricted Update

`can_comment` allows changing only `notes` and `status`. It blocks changes to `priority`, `description`, `department`, `due_date`, and `assign_to`. Use this for agents that should report progress but not modify task scope.

## Project and Department Management

### `writbase:manage_projects`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `name` | Creates project, auto-generates slug |
| `rename` | `project_id`, `name` | Updates display name |
| `archive` | `project_id` | Archived projects hide from active views, permissions become inert |

### `writbase:manage_departments`

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `name` | Creates department, auto-generates slug |
| `rename` | `department_id`, `name` | Updates display name |
| `archive` | `department_id` | Archived departments hide from active views |

## Webhook Subscriptions

Use `writbase:subscribe` to register webhooks for task event notifications:

| Action | Required Params | Notes |
|--------|----------------|-------|
| `create` | `project`, `url` | HTTPS-only. Optional `event_types` (default: `["task.completed"]`) |
| `list` | -- | Lists all subscriptions for your agent key |
| `delete` | `subscription_id` | Removes the subscription |

Valid event types: `task.created`, `task.updated`, `task.completed`, `task.failed`, `task.assigned`, `task.reassigned`.

The `secret` for HMAC-SHA256 signature verification is returned only on creation -- store it securely.

## Provenance and Audit

Use `writbase:get_provenance` to view the event log:

- `project` (required): scopes events to a specific project
- `target_type` (optional): filter by `task`, `agent_key`, `project`, or `department`
- `event_category` (optional): filter by `task`, `admin`, or `system`
- Paginated with `limit` (max 50) and `cursor`

## Agent Discovery

Use `writbase:discover_agents` to list agents with access to a project:

- `project` (required): the project slug
- `skill` (optional): filter agents by declared skill/capability

## Example: Full Agent Provisioning

```
# Step 1: Create a worker key
writbase:manage_agent_keys {
  "action": "create",
  "name": "deploy-bot",
  "special_prompt": "You handle deployment tasks. Mark tasks done only after verifying the deployment succeeded."
}
# Response includes full_key: "wb_<key_id>_<secret>" -- store this securely

# Step 2: Grant permissions (use project_id UUID from writbase:info)
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<key_id from step 1>",
  "permissions": [
    {
      "project_id": "<project-uuid>",
      "department_id": "<ops-dept-uuid>",
      "can_read": true,
      "can_create": true,
      "can_update": true
    }
  ]
}

# Step 3: Verify the agent appears
writbase:discover_agents { "project": "my-project" }
# Confirm "deploy-bot" is listed with expected permissions
```

See [agent-provisioning.md](references/agent-provisioning.md) for more provisioning patterns including cross-department and delegation setups.
