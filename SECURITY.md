# Security Policy

## Reporting a Vulnerability

WritBase takes security seriously. If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email security concerns to: **security@writbase.io**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Depends on severity (critical: 72 hours, high: 1 week, medium: 2 weeks)

### Scope

The following are in scope:
- Authentication bypass (agent key auth, Supabase Auth)
- Authorization bypass (permission escalation, cross-workspace data access)
- Injection vulnerabilities (SQL, XSS, command injection)
- Sensitive data exposure (agent key secrets, workspace data leakage)
- MCP protocol vulnerabilities

### Out of Scope

- Denial of service attacks
- Social engineering
- Issues in third-party dependencies (report to the upstream project)
- Issues requiring physical access

### Recognition

We will credit security researchers who report valid vulnerabilities (with their permission) in our CHANGELOG and release notes.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Architecture

WritBase implements defense-in-depth:

- **Agent key auth**: SHA-256 hashed keys with timing-safe comparison
- **Workspace isolation**: All data scoped by `workspace_id` with NOT NULL constraints
- **RLS policies**: Row-level security on all human-facing queries
- **MCP authorization**: Per-request permission validation in Edge Functions
- **Append-only audit log**: Immutable `event_log` for full provenance
- **Rate limiting**: Per-agent-key request throttling
