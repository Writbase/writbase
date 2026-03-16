# Getting Started with WritBase

Set up WritBase and have your first AI agent managing tasks in under 10 minutes.

## What you'll build

By the end of this guide, you'll have:
- A WritBase instance running on Supabase Cloud (free tier)
- A project with departments for organizing work
- An AI agent (via Claude Code, Cursor, or any MCP client) creating and updating tasks

## Prerequisites

- A [Supabase](https://supabase.com) account (free, no credit card)
- Node.js 18+
- An MCP-compatible client ([Claude Code](https://claude.ai/claude-code), [Cursor](https://cursor.sh), VS Code, or [Windsurf](https://codeium.com/windsurf))

---

## Step 1: Deploy WritBase

```bash
git clone https://github.com/Writbase/writbase.git
cd writbase && npm install
```

Create a free Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard), then:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase functions deploy mcp-server --no-verify-jwt
```

This deploys the database schema (tables, RPC functions, indexes) and the MCP Edge Function.

### Start the dashboard (optional)

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and anon key
npm run dev
```

The dashboard runs at `http://localhost:3000` — sign up, and a workspace is auto-created for you.

> See the [Deployment Guide](deployment.md) for Vercel hosting, self-hosted Supabase, and production configuration.

---

## Step 2: Create a project and departments

In the WritBase dashboard:

1. Click **Projects** in the sidebar → **Add Project**
2. Name it (e.g., `my-app`) — this creates a URL-friendly slug automatically
3. (Optional) Add departments: click into the project → **Add Department** (e.g., `backend`, `frontend`, `devops`)

Departments let you scope agent permissions to specific areas. If you skip departments, agents get project-wide access.

---

## Step 3: Create an agent key

1. Navigate to **Agent Keys** → **Create Key**
2. Enter a name (e.g., `claude-code`) and select the **worker** role
3. **Save the key** — you'll see `wb_<key_id>_<secret>`. This is shown only once.

### Grant permissions

**Option A — CLI** (recommended):

```bash
writbase key permit claude-code --grant --project my-app --can-read --can-create --can-update
```

**Option B — Dashboard**:

Click into the key → **Permissions** → **Add Permission**:

| Field | Value |
|-------|-------|
| Project | `my-app` |
| Department | (leave blank for project-wide, or select one) |
| can_read | ✅ |
| can_create | ✅ |
| can_update | ✅ |

This gives the agent read/write access to tasks in `my-app`. For a read-only agent, grant only `can_read`.

To add cross-department assignment later:
```bash
writbase key permit claude-code --grant --project my-app --can-assign
```
This preserves existing flags — only `can_assign` is added.

---

## Step 4: Connect your MCP client

Your WritBase MCP endpoint is:

```
https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp
```

### Claude Code

```bash
claude mcp add writbase \
  --transport http \
  --url https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp \
  --header "Authorization: Bearer wb_<key_id>_<secret>"
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "writbase": {
      "type": "streamableHttp",
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp",
      "headers": {
        "Authorization": "Bearer wb_<key_id>_<secret>"
      }
    }
  }
}
```

### VS Code / Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "writbase": {
      "type": "http",
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp",
      "headers": {
        "Authorization": "Bearer wb_<key_id>_<secret>"
      }
    }
  }
}
```

> See the [MCP Config Reference](mcp-config-reference.md) for Windsurf, Claude Desktop, and generic clients.

---

## Step 5: Try it

### Check identity

Ask your agent:

> "Use the WritBase info tool to check my permissions"

You'll see the agent's name, role, and scoped permissions:

```json
{
  "agent": { "name": "claude-code", "role": "worker" },
  "permissions": {
    "scopes": [{
      "project": "my-app",
      "department": null,
      "can_read": true,
      "can_create": true,
      "can_update": true
    }]
  }
}
```

### Create a task

> "Create a task in my-app: Set up CI/CD pipeline with GitHub Actions, priority high"

The agent calls `add_task` with:

```json
{
  "project": "my-app",
  "description": "Set up CI/CD pipeline with GitHub Actions",
  "priority": "high"
}
```

### Update a task

> "Mark that task as in_progress and add a note: Started with lint + test workflow"

The agent calls `update_task` with `task_id`, `version` (for optimistic concurrency), `status`, and `notes`.

### List tasks

> "Show me all tasks in my-app"

The agent calls `get_tasks` — supports filtering by status, priority, department, and full-text search.

---

## Step 6: Add more agents

Create additional keys with different permission scopes:

| Agent | Role | Permissions | Use case |
|-------|------|-------------|----------|
| `ci-bot` | worker | `my-app/devops`: can_read, can_create, can_update | CI pipeline creates tasks on failure |
| `triage-agent` | worker | `my-app` (project-wide): can_read, can_comment | Reviews tasks, adds notes, changes status |
| `admin-agent` | manager | (all manager tools) | Manages keys, permissions, projects |

### Permission types

| Permission | What it allows |
|------------|---------------|
| `can_read` | List and view tasks |
| `can_create` | Create new tasks |
| `can_update` | Change any task field (priority, description, department, etc.) |
| `can_comment` | Change only `status` and `notes` (restricted update) |
| `can_assign` | Delegate tasks to other agents |
| `can_archive` | Archive/unarchive tasks |

Permissions are scoped per **(project, department)** pair. An agent can have different permissions in different departments.

---

## What's next

- **[Core Concepts](concepts.md)** — Permissions model, optimistic concurrency, provenance, error codes
- **[Deployment Guide](deployment.md)** — Production setup, Vercel hosting, environment variables
- **Set up departments** — Organize by team, scope agent access to specific areas
- **Try manager features** — Create a manager key to let an agent manage other agents
- **Enable webhooks** — Use the `subscribe` tool to get notified on task events
- **Top-N tasks** — Use `get_top_tasks` to get the highest priority items

---

## Troubleshooting

### "401 Unauthorized"
- Verify the key is correct and active (check the dashboard)
- Ensure the `Authorization` header uses the `Bearer` prefix
- Keys can be deactivated — check the key's status

### "No tools available" / empty tool list
- The agent key has no permissions — grant at least one project scope
- Check that the project isn't archived

### "scope_not_allowed"
- The agent is trying to access a project or department it doesn't have permissions for
- Check the `info` tool output to see what scopes are granted

### "version_conflict"
- Another agent or user updated the task since you last read it
- Re-read the task to get the current version, then retry

### Connection timeout
- Verify the Supabase project URL: `curl https://<project-ref>.supabase.co/functions/v1/mcp-server/health`
- Check that Edge Functions are deployed in the Supabase dashboard
