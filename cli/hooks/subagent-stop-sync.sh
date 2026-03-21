#!/usr/bin/env bash
# WritBase SubagentStop hook — auto-marks tasks done when a subagent finishes.
#
# Called by Claude Code Agent Teams on SubagentStop events.
# Reads JSON from stdin, inspects the subagent transcript for WritBase
# update_task calls, and marks the task done if the subagent succeeded.
#
# This hook ALWAYS outputs {"decision":"approve"} — it never blocks.
# The WritBase update is best-effort (fire-and-forget).

APPROVE='{"decision":"approve"}'
DEFAULT_MCP_URL="https://bblhnneesokjhcbvffkp.supabase.co/functions/v1/mcp-server/mcp"
MCP_URL="${WRITBASE_MCP_URL:-$DEFAULT_MCP_URL}"

# ── Read stdin JSON ──────────────────────────────────────────────────────────

INPUT="$(cat)"
if [ -z "$INPUT" ]; then
  echo "$APPROVE"
  exit 0
fi

# ── Parse fields from stdin ──────────────────────────────────────────────────

transcript_path="$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)"
session_id="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
stop_hook_active="$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)"

# ── Loop break: if stop_hook_active, approve immediately ─────────────────────
# This prevents recursion when a hook itself triggers a SubagentStop.

if [ "$stop_hook_active" = "true" ]; then
  echo "$APPROVE"
  exit 0
fi

# ── Validate transcript path ─────────────────────────────────────────────────

if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  echo "$APPROVE"
  exit 0
fi

# ── Check WRITBASE_AGENT_KEY ──────────────────────────────────────────────────

if [ -z "$WRITBASE_AGENT_KEY" ]; then
  echo "$APPROVE"
  exit 0
fi

# ── Detect WritBase task work in transcript ───────────────────────────────────
# Transcript is JSONL. Look for tool_use lines that reference update_task.

update_calls="$(timeout 2 grep -F '"tool_use"' "$transcript_path" 2>/dev/null \
  | grep -F 'mcp__writbase__update_task' 2>/dev/null)" || true

if [ -z "$update_calls" ]; then
  # Not a WritBase subagent — nothing to do
  echo "$APPROVE"
  exit 0
fi

# ── Extract task_id from the LAST update_task tool_use ────────────────────────

last_call="$(echo "$update_calls" | tail -1)"
task_id="$(echo "$last_call" | jq -r '
  .content[]?.input?.task_id //
  .input?.task_id //
  .params?.arguments?.task_id //
  .arguments?.task_id //
  empty
' 2>/dev/null | tail -1)" || true

if [ -z "$task_id" ]; then
  # Try broader extraction — grab any task_id-shaped UUID near update_task
  task_id="$(echo "$last_call" \
    | grep -oP '"task_id"\s*:\s*"[0-9a-f-]{36}"' 2>/dev/null \
    | tail -1 \
    | grep -oP '[0-9a-f-]{36}' 2>/dev/null)" || true
fi

if [ -z "$task_id" ]; then
  echo "$APPROVE"
  exit 0
fi

# ── Check if subagent set status to in_progress ──────────────────────────────
# Only auto-complete tasks the subagent was actively working on.

in_progress_match="$(echo "$update_calls" | grep -F '"in_progress"' 2>/dev/null)" || true
if [ -z "$in_progress_match" ]; then
  # Subagent never moved task to in_progress — don't auto-complete
  echo "$APPROVE"
  exit 0
fi

# ── Extract version from the LAST successful update_task response ─────────────
# Look for tool_result lines that follow an update_task call and contain a version.

tool_results="$(timeout 2 grep -F '"tool_result"' "$transcript_path" 2>/dev/null)" || true
version=""

if [ -n "$tool_results" ]; then
  # Get the last tool_result that contains a version field and a task id
  version="$(echo "$tool_results" \
    | grep -F "$task_id" 2>/dev/null \
    | tail -1 \
    | grep -oP '"version"\s*:\s*\K[0-9]+' 2>/dev/null \
    | tail -1)" || true
fi

# Fallback: try to fetch current version from WritBase API
if [ -z "$version" ]; then
  fetch_resp="$(timeout 5 curl -s -X POST "$MCP_URL" \
    -H "Authorization: Bearer $WRITBASE_AGENT_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_tasks\",\"arguments\":{\"task_id\":\"$task_id\"}}}" \
    2>/dev/null)" || true

  if [ -n "$fetch_resp" ]; then
    version="$(echo "$fetch_resp" \
      | jq -r '
        .result?.content[]?.text //
        .result?.text //
        empty
      ' 2>/dev/null \
      | jq -r '.version // .tasks[0].version // empty' 2>/dev/null \
      | head -1)" || true
  fi
fi

if [ -z "$version" ] || ! [[ "$version" =~ ^[0-9]+$ ]]; then
  # Cannot determine version — unsafe to update without it
  echo "$APPROVE"
  exit 0
fi

# ── Verify subagent success ───────────────────────────────────────────────────
# Check that the last assistant message doesn't indicate a failure.

last_assistant="$(timeout 2 grep -F '"assistant"' "$transcript_path" 2>/dev/null \
  | tail -1)" || true

if [ -n "$last_assistant" ]; then
  # Look for error indicators in the last assistant message
  error_match="$(echo "$last_assistant" \
    | grep -iE '"(error|failed|failure|exception|abort)"' 2>/dev/null)" || true
  if [ -n "$error_match" ]; then
    # Subagent ended with an error — don't mark done
    echo "$APPROVE"
    exit 0
  fi
fi

# ── Mark task done via WritBase MCP ───────────────────────────────────────────

notes="Completed by Claude Code subagent"
if [ -n "$session_id" ]; then
  notes="Completed by Claude Code subagent (session: ${session_id})"
fi

payload="$(jq -n \
  --arg tid "$task_id" \
  --argjson ver "$version" \
  --arg notes "$notes" \
  '{
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "update_task",
      arguments: {
        task_id: $tid,
        version: $ver,
        status: "done",
        notes: $notes
      }
    }
  }' 2>/dev/null)" || true

if [ -n "$payload" ]; then
  # Fire-and-forget — don't let curl failure affect the hook
  timeout 5 curl -s -X POST "$MCP_URL" \
    -H "Authorization: Bearer $WRITBASE_AGENT_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    >/dev/null 2>&1 || true
fi

# ── Always approve ────────────────────────────────────────────────────────────

echo "$APPROVE"
exit 0
