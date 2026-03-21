#!/usr/bin/env bash
#
# WritBase Audit Trail — PostToolUse Hook
#
# Captures git commit and PR creation events from Claude Code tool calls
# and posts provenance notes to the active WritBase task.
#
# Environment:
#   WRITBASE_AGENT_KEY   — wb_<key_id>_<secret> bearer token (required)
#   WRITBASE_MCP_URL     — MCP endpoint (defaults to hosted instance)
#
# Reads JSON from stdin: { tool_name, tool_input, tool_response, session_id }
# Outputs nothing to stdout.

# --- Read stdin -----------------------------------------------------------

INPUT="$(cat)"

# --- Gate: only process Bash tool calls -----------------------------------

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name' 2>/dev/null || echo "")
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# --- Gate: agent key must be set ------------------------------------------

if [ -z "$WRITBASE_AGENT_KEY" ]; then
  exit 0
fi

MCP_URL="${WRITBASE_MCP_URL:-https://bblhnneesokjhcbvffkp.supabase.co/functions/v1/mcp-server/mcp}"

# --- Extract command and response -----------------------------------------

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command' 2>/dev/null || echo "")
RESPONSE=$(echo "$INPUT" | jq -r '.tool_response' 2>/dev/null || echo "")

if [ -z "$COMMAND" ]; then
  exit 0
fi

# --- Match: git commit ----------------------------------------------------

NOTES=""

if echo "$COMMAND" | grep -qE 'git\s+commit'; then
  # Extract commit SHA from response — look for 7-40 char hex after common patterns
  COMMIT_SHA=$(echo "$RESPONSE" | grep -oE '\b[0-9a-f]{7,40}\b' | head -1 || echo "")

  # Extract commit message: try -m flag first, then fall back to response
  COMMIT_MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s["\x27])[^"\x27]+' | head -1 || echo "")
  if [ -z "$COMMIT_MSG" ]; then
    # Try heredoc-style: look for lines after -m
    COMMIT_MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s")[^"]+' | head -1 || echo "")
  fi
  if [ -z "$COMMIT_MSG" ]; then
    # Fall back to first meaningful line from response
    COMMIT_MSG=$(echo "$RESPONSE" | grep -oP '(?<=\] ).+' | head -1 || echo "")
  fi

  if [ -n "$COMMIT_SHA" ]; then
    # Truncate message to keep notes reasonable
    COMMIT_MSG=$(echo "$COMMIT_MSG" | cut -c1-120)
    if [ -n "$COMMIT_MSG" ]; then
      NOTES="Commit ${COMMIT_SHA}: ${COMMIT_MSG}"
    else
      NOTES="Commit ${COMMIT_SHA}"
    fi
  fi

# --- Match: gh pr create -------------------------------------------------

elif echo "$COMMAND" | grep -qE 'gh\s+pr\s+create'; then
  PR_URL=$(echo "$RESPONSE" | grep -oE 'https://github\.com/[^ ]+/pull/[0-9]+' | head -1 || echo "")

  if [ -n "$PR_URL" ]; then
    NOTES="PR created: ${PR_URL}"
  fi
fi

# --- Gate: must have something to report ----------------------------------

if [ -z "$NOTES" ]; then
  exit 0
fi

# --- Read active task context ---------------------------------------------

TASK_FILE=".claude/current-task.json"

if [ ! -f "$TASK_FILE" ]; then
  exit 0
fi

TASK_ID=$(jq -r '.task_id' "$TASK_FILE" 2>/dev/null || echo "")
VERSION=$(jq -r '.version' "$TASK_FILE" 2>/dev/null || echo "")

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
  exit 0
fi

if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
  exit 0
fi

# --- Escape notes for JSON ------------------------------------------------

# Use jq to safely encode the notes string
NOTES_JSON=$(echo "$NOTES" | jq -Rs '.' 2>/dev/null || echo "\"\"")

# --- POST to WritBase MCP ------------------------------------------------

PAYLOAD=$(cat <<ENDJSON
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "update_task",
    "arguments": {
      "task_id": "${TASK_ID}",
      "version": ${VERSION},
      "notes": ${NOTES_JSON}
    }
  }
}
ENDJSON
)

# Fire and forget — no response check, no retry
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $WRITBASE_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  >/dev/null 2>&1 &

exit 0
