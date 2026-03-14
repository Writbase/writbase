# Agent Provisioning Guides

Step-by-step guides for common agent provisioning patterns. All examples assume you are connected as a manager-role agent.

Before provisioning, call `writbase:info` to get your project and department UUIDs from the `permissions.scopes` array.

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

## 3. Delegation Setup

An agent that can assign tasks to other agents. This requires `can_assign` permission and an understanding of delegation constraints.

### Step 1: Create the coordinating agent

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "coordinator-agent",
  "special_prompt": "You coordinate work across the team. Assign tasks to the most appropriate agent based on their skills."
}
```

### Step 2: Grant permissions with `can_assign`

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

### Step 3: Create worker agents that can be assigned to

The workers do not need `can_assign` themselves -- they just need permissions in the same project.

```
writbase:manage_agent_keys {
  "action": "create",
  "name": "frontend-agent"
}

writbase:manage_agent_permissions {
  "action": "grant",
  "key_id": "<frontend-agent-key-id>",
  "permissions": [
    {
      "project_id": "<project-uuid>",
      "department_id": "<frontend-dept-uuid>",
      "can_read": true,
      "can_update": true
    }
  ]
}
```

### Delegation constraints

WritBase enforces two safety mechanisms on task assignment:

**`delegation_depth` (max 3)**: Each time a task is reassigned, the depth increments. After 3 reassignments, further delegation is blocked with `delegation_depth_exceeded`. The agent must either complete the task directly or create a new task.

**`assignment_chain` (cycle detection)**: The database tracks every agent key ID that has been assigned the task. If an agent appears in the chain already, `circular_delegation` is returned. This prevents A -> B -> A loops.

### How the coordinator assigns work

Once provisioned, the coordinator uses `writbase:update_task` with the `assign_to` param:

```
writbase:update_task {
  "task_id": "<task-uuid>",
  "version": 2,
  "assign_to": "frontend-agent"
}
```

The `assign_to` field accepts either the agent's name or key ID.

To unassign a task (return it to the pool), pass an empty string:

```
writbase:update_task {
  "task_id": "<task-uuid>",
  "version": 3,
  "assign_to": ""
}
```

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
- Cannot change `priority`, `description`, `department`, `due_date`, or `assign_to`
