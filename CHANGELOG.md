# Changelog

All notable changes to WritBase will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-21

### Added

- **Task Dependencies (DAG)** — `task_dependencies` junction table with cycle detection via recursive CTE
  - `add_task` supports `blocked_by` parameter for atomic creation with dependencies
  - `update_task` supports `add_blocked_by` / `remove_blocked_by` for managing edges
  - `get_tasks` and `get_top_tasks` return `blocked_by` array in compact output
  - Database-level cycle prevention via `check_dependency_cycle()` function
- **Session-to-Task Linking** — `session_id` column on tasks for cross-session resume
  - `add_task` and `update_task` accept optional `session_id` parameter
  - Indexed for efficient "what did this session accomplish?" queries
- **Context-Fence Skill Pair** — router + recipes skills for ~87% token savings
  - `writbase-router` (68 lines): intent classification, dispatches to recipes or direct tool calls
  - `writbase-recipes` (418 lines, `context: fork`): dense API reference in isolated subagent
- **/loop Skill** — autonomous task processing loop with sequential fetch-claim-execute-complete protocol
  - Writes `.claude/current-task.json` for hook integration
  - Circuit breaker (3 consecutive errors), version conflict retry
- **Audit Trail Hook** — PostToolUse hook captures git commit SHAs and PR URLs as task provenance
- **Agent Teams Hook Sync** — SubagentStop hook auto-marks WritBase tasks done when subagents complete
- **Mobile PWA** — Progressive Web App with offline support
  - Web app manifest, service worker (Workbox), app icons
  - Responsive task card view for mobile, full-screen modal, sticky mobile header
  - IndexedDB-backed offline mutation queue with auto-sync on reconnect
  - Install prompt banner, network status indicator
- **Stop Hook** — blocks session end when WritBase tools were used but tasks not reconciled (structural JSONL transcript parsing)

## [0.1.0] - 2026-03-12

### Added

- **MCP Server** with 11 tools via Streamable HTTP transport
  - Worker tools: `info`, `get_tasks`, `add_task`, `update_task`
  - Manager tools: `manage_agent_keys`, `manage_agent_permissions`, `get_provenance`, `manage_projects`, `manage_departments`, `subscribe`, `discover_agents`
- **Multi-tenant workspaces** with automatic provisioning on signup
- **Agent key authentication** with compound credential format (`wb_<key_id>_<secret>`) and SHA-256 hashing
- **Fine-grained permissions** per agent key, scoped by project and department
  - Capabilities: `can_read`, `can_create`, `can_update`, `can_assign`, `can_comment`
  - Per-row subset constraint for manager delegation
- **Inter-agent task delegation** with assignment tracking, delegation depth limits, and cycle detection
- **Optimistic concurrency control** via task version field
- **Append-only event log** for full provenance and audit trail
- **Dynamic MCP schema** per agent role and permissions (tool visibility, enum injection, description hints)
- **Cursor-based pagination** via Postgres RPC
- **Rate limiting** per agent key via Postgres upsert
- **Webhook subscriptions** for task event notifications (manager-only)
- **Agent discovery** with capabilities and skill-based filtering
- **Next.js 16 dashboard** with task table, sidebar navigation, agent key management, permission editor, and provenance timeline
- **CI/CD pipeline** with GitHub Actions (build, test, lint, deploy)
- **Supabase Edge Functions** with Deno runtime, Hono routing, Sentry integration
