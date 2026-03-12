# Workspace Provisioning

WritBase automatically creates a workspace when a new user signs up. No manual setup is required.

## How It Works

1. User signs up via the login page (email + password)
2. A Postgres trigger (`handle_new_user`) fires on `auth.users` INSERT
3. The trigger creates:
   - A `workspaces` row (name: "My Workspace", slug derived from user ID)
   - A `workspace_members` row (role: `owner`)
   - An `app_settings` row (default settings for the workspace)
4. User is redirected to the dashboard, which loads their workspace automatically

## Fallback: `ensure_user_workspace()` RPC

If the trigger fails (logged as a WARNING, does not block signup), the dashboard layout calls the `ensure_user_workspace()` SECURITY DEFINER RPC on first visit. This idempotently provisions the workspace, handling concurrent calls via `ON CONFLICT`.

## Data Isolation

All data tables include a `workspace_id` column with NOT NULL constraint. RLS policies use `get_user_workspace_ids()` to scope all queries to the user's workspaces. MCP (Edge Functions) uses `service_role` which bypasses RLS, so every query explicitly filters by `ctx.workspaceId` from the authenticated agent key.

Cross-workspace data corruption is prevented at the database level by `check_workspace_consistency()` triggers on `agent_permissions`, `tasks`, and `webhook_subscriptions`.

## Previous Bootstrap Problem (Eliminated)

Before the workspace migration (00019), WritBase used an `admin_users` table as a global gate. The first admin had to be manually INSERT-ed via SQL. This is no longer necessary — signup handles everything automatically.
