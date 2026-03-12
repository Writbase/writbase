# Changelog

All notable changes to WritBase will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
