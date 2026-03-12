# MCP Client Configuration Reference

Configuration snippets for connecting MCP clients to WritBase.

> **Verification status**: Claude Code config is verified. Other client configs are based on current documentation and labeled with verification status. Please [report issues](https://github.com/dynreadme/writbase/issues) if a config doesn't work.
>
> Last verified: 2026-03-12

## Connection Details

- **URL**: `https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp`
- **Transport**: Streamable HTTP
- **Authentication**: `Authorization: Bearer wb_<key_id>_<secret>`

Replace `<project-ref>` with your Supabase project reference and `wb_<key_id>_<secret>` with your agent key.

---

## Claude Code

**Status: Verified**

```bash
claude mcp add writbase \
  --transport http \
  --url https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp \
  --header "Authorization: Bearer wb_<key_id>_<secret>"
```

This adds the server to `~/.claude/claude_desktop_config.json`. To verify:

```bash
claude mcp list
```

---

## Cursor

**Status: Unverified — please report issues**

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

---

## VS Code / GitHub Copilot

**Status: Unverified — please report issues**

Add to `.vscode/mcp.json` in your project root:

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

---

## Windsurf

**Status: Unverified — please report issues**

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "writbase": {
      "serverUrl": "https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp",
      "headers": {
        "Authorization": "Bearer wb_<key_id>_<secret>"
      }
    }
  }
}
```

---

## Claude Desktop

**Status: Unverified — please report issues**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

---

## Generic MCP Client

For any MCP client that supports Streamable HTTP:

- **Transport**: `streamableHttp` (or `http` depending on client)
- **URL**: `https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp`
- **Headers**: `Authorization: Bearer wb_<key_id>_<secret>`
- **Method**: POST for tool calls, GET for SSE notifications

The server supports standard MCP methods: `initialize`, `tools/list`, `tools/call`.

---

## Troubleshooting

### "401 Unauthorized"
- Verify your agent key is correct and active
- Ensure the `Authorization` header uses `Bearer` prefix
- Check that the key hasn't been deactivated

### "No tools available"
- The agent key may have no permissions granted
- Use the dashboard to verify permissions are set for at least one project

### Connection timeout
- Verify the Supabase project URL is correct
- Check that Edge Functions are deployed: `curl https://<project-ref>.supabase.co/functions/v1/mcp-server/health`

### "rate_limited" error
- Agent keys have per-key rate limits
- Wait for the `retry_after` period specified in the error response
