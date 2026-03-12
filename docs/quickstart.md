# Quickstart

Get WritBase running and connected to Claude Code in under 5 minutes.

## Prerequisites

- A deployed WritBase instance (see [Deployment Guide](deployment.md))
- [Claude Code](https://claude.ai/claude-code) CLI installed

## Step 1: Sign Up and Create a Project

1. Visit your WritBase dashboard URL
2. Sign up with email and password (a workspace is auto-created)
3. Click "Add Project" in the sidebar and create your first project (e.g., "my-project")

## Step 2: Create an Agent Key

1. Navigate to the **Agent Keys** page in the dashboard
2. Click **Create Key**
3. Enter a name (e.g., "claude-code-agent") and select the **worker** role
4. Copy the generated key (`wb_<key_id>_<secret>`) — it's shown only once
5. Add permissions: select your project, check `can_read`, `can_create`, `can_update`

## Step 3: Configure Claude Code

```bash
claude mcp add writbase \
  --transport http \
  --url https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp \
  --header "Authorization: Bearer wb_<key_id>_<secret>"
```

Replace `<project-ref>` with your Supabase project reference and `wb_<key_id>_<secret>` with your agent key.

## Step 4: Verify Connection

In Claude Code, ask:

> "Use the WritBase info tool to check my permissions"

You should see your agent name, role, permitted projects, and available operations.

## Step 5: Create Your First Task

Ask Claude Code:

> "Create a task in my-project: Set up CI/CD pipeline"

The agent will use the `add_task` tool to create the task in your WritBase instance.

## What's Next?

- **Add more agents**: Create additional keys with different permission scopes
- **Set up departments**: Organize tasks by team (engineering, ops, research)
- **Try manager features**: Create a manager key to delegate administration to an agent
- **Enable webhooks**: Subscribe to task events for real-time notifications

## MCP Tools Available

Once connected, your agent has access to:

| Tool | What it does |
|------|-------------|
| `info` | Check identity and permissions |
| `get_tasks` | List and filter tasks |
| `add_task` | Create new tasks |
| `update_task` | Update task status, priority, notes |

Manager agents additionally get: `manage_agent_keys`, `manage_agent_permissions`, `get_provenance`, `manage_projects`, `manage_departments`, `subscribe`, `discover_agents`.

See the [MCP Config Reference](mcp-config-reference.md) for connecting other clients.
