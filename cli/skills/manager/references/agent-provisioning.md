# Agent Provisioning Guides

Step-by-step guides for common agent provisioning patterns. All examples assume you are connected as a manager-role agent.

Before provisioning, call `writbase:info` to get your project and department UUIDs from the `permissions.scopes` array.

> **CLI alternative**: Operators can provision keys and permissions entirely from the CLI:
> ```bash
> writbase key add --name deploy-bot --role worker --mcp
> writbase key permit deploy-bot --grant --project my-project --department ops --can-read --can-create --can-update
> writbase key permit deploy-bot   # list current permissions
> ```

---

## 1. Single-Project Worker

A worker that can read, create, and update tasks in one project.

### Step 1: Create the agent key

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "build-agent",
  "special_prompt": "You handle build and CI tasks. Always include build logs in task notes when marking done."
}
```

Response:
```json
{
  "key_id": "a1b2c3d4-...",
  "full_key": "wb_a1b2c3d4-..._secrethere",
  "name": "build-agent",
  "role": "worker",
  "is_active": true,
  "warning": "Store this key securely. It will NOT be shown again."
}
```

### Step 2: Grant permissions

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "a1b2c3d4-...",
  "permissions": [
    {
      "project_id": "<your-project-uuid>",
      "can_read": true,
      "can_create": true,
      "can_update": true
    }
  ]
}
```

This grants project-wide access (no department restriction) with read, create, and update.

### Step 3: Verify

```
writbase:discover_agents { "project": "my-project" }
```

Confirm "build-agent" appears in the results with the expected permissions.

---

## 2. Cross-Department Agent

An agent that operates across multiple departments with different permission levels.

### Step 1: Create the agent key

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "triage-agent",
  "special_prompt": "You triage incoming tasks: read from intake, create in the appropriate department."
}
```

### Step 2: Grant separate permission rows per department

Each department needs its own permission row. Rows are evaluated independently.

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<triage-agent-key-id>",
  "permissions": [
    {
      "project_id": "<project-uuid>",
      "department_id": "<intake-dept-uuid>",
      "can_read": true,
      "can_update": true
    },
    {
      "project_id": "<project-uuid>",
      "department_id": "<engineering-dept-uuid>",
      "can_read": true,
      "can_create": true
    },
    {
      "project_id": "<project-uuid>",
      "department_id": "<design-dept-uuid>",
      "can_read": true,
      "can_create": true
    }
  ]
}
```

This agent can:
- Read and update tasks in the "intake" department (move them through triage statuses)
- Read tasks and create new tasks in "engineering" and "design" departments
- Cannot update tasks in engineering/design (intentional -- triage only creates, doesn't modify)

### Step 3: Verify

```
writbase:manage_agent_permissions {
  "action": "list",
  "key_id": "<triage-agent-key-id>"
}
```

Confirm all three permission rows are present with correct flags.

---

## 3. Cross-Department Assignment Setup

An agent that can create tasks in other teams' queues. This requires `can_assign` permission.

### Step 1: Create the coordinating agent

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "coordinator-agent",
  "special_prompt": "You coordinate work across the team. Create tasks in the appropriate department based on the work needed."
}
```

### Step 2: Grant permissions with `can_assign`

Via MCP:
```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<coordinator-key-id>",
  "permissions": [
    {
      "project_id": "<project-uuid>",
      "can_read": true,
      "can_create": true,
      "can_update": true,
      "can_assign": true
    }
  ]
}
```

Or via CLI (operator shortcut — most common for adding `can_assign` after initial setup):
```bash
writbase key permit coordinator-agent --grant --project my-project --can-read --can-create --can-update --can-assign
```

The `assign_task` tool creates tasks in departments where the agent has `can_assign` permission. Provenance (who requested the task) is tracked via event_log actor fields.

### How the coordinator creates cross-department work

Use `writbase:assign_task` to create tasks in another team's queue:

**Create work in another department:**
```
writbase:assign_task {
  "project": "my-project",
  "department": "frontend",
  "description": "Fix responsive layout on settings page",
  "priority": "high"
}
```

The `assign_task` tool requires `department` (you're assigning to a specific team). It checks `can_assign` instead of `can_create`.

---

## 4. Comment-Only Observer

An agent that can monitor and report on tasks but cannot change their scope.

### Step 1: Create the key

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "status-reporter",
  "special_prompt": "You monitor task progress and add status notes. Do not change task priorities or descriptions."
}
```

### Step 2: Grant `can_read` + `can_comment`

```
writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<reporter-key-id>",
  "permissions": [
    {
      "project_id": "<project-uuid>",
      "can_read": true,
      "can_comment": true
    }
  ]
}
```

This agent can:
- Read all tasks in the project
- Change `status` (e.g., mark tasks `in_progress` or `done`)
- Add/update `notes`
- Cannot change `priority`, `description`, `department`, `due_date`, or `is_archived`
