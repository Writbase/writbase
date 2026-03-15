---
name: extract-tasks
description: Review conversation and extract untracked work items as WritBase tasks (writbase:info, writbase:add_task). Use at end of session to capture untracked work.
---

# Extract Tasks from Conversation

Scan the current conversation for task-like content and propose adding untracked items to WritBase. **This is a review-and-confirm workflow — never create tasks without explicit user approval.**

## Prohibitions

- **Do not auto-invoke this skill.** Only run when the user types `/extract-tasks` or explicitly asks to extract tasks.
- **Do not update existing tasks.** This skill creates new tasks only.
- **Do not retry on MCP connection failure.** Show error and stop.

## Workflow

### Step 1: Validate WritBase Connection

Call `writbase:info` to verify the MCP server is connected.

- **If the call fails or returns an error**: Output the following and stop:
  > WritBase MCP is not connected. Run `npx writbase status` to check your setup.
- **If connected**: Extract the list of available **projects** and **departments** from the response. You will use these to constrain valid scopes when creating tasks.

### Step 2: Locate the Session Transcript

The current conversation is stored as a JSONL file. Identify it:

1. Determine the Claude projects directory for the current workspace. The path pattern is `~/.claude/projects/<mangled-cwd>/` where `<mangled-cwd>` is the absolute working directory with `/` replaced by `-` (leading `-` preserved). Run `pwd` to get the current directory, mangle it, and list matching `*.jsonl` files sorted by modification time (most recent first).
2. The most recently modified file is almost certainly this session. Use it.
3. If multiple files were modified within the last 2 minutes, ask the user to confirm which session to scan.

### Step 3: Parse Conversation Content

Session JSONL files contain many record types. **Only scan records relevant to the conversation:**

- **Include**: Records where `type` is `"user"` or `"assistant"` — these are the actual conversation turns.
- **Skip**: Records where `type` is `"progress"`, `"file-history-snapshot"`, `"system"`, or anything else. These are hook events, tool metadata, and internal bookkeeping (~90% of records).

For included records, extract text from `message.content`. This field may be:
- A plain string
- An array of content blocks (extract `text` from blocks where `type` is `"text"`)

Use Grep on the JSONL file to find lines containing task-signal keywords, then Read surrounding lines for context. Task signals include:

- **Action verbs with objects**: "need to", "should", "must", "have to", "TODO", "FIXME", "let's add", "we need"
- **Deadline language**: "by Friday", "before release", "this sprint", "due date"
- **Assignment language**: "I'll handle", "you should", "assigned to", "owner"
- **Commitment language**: "I'll do", "let me", "will implement", "going to"
- **Problem statements**: "bug in", "broken", "failing", "doesn't work", "issue with"

Apply neighborhood context: read 3 messages before and 2 after each candidate to resolve vague references (e.g., "that thing" refers to what was discussed 2 messages earlier).

### Step 4: Extract and Present Candidates

For each task-like item found, prepare:

- **Description**: A clear, actionable task description (minimum 3 characters, aim for a complete sentence)
- **Priority**: Inferred from context — `critical` (blocking/urgent), `high` (important/soon), `medium` (default), `low` (nice-to-have/someday)
- **Source quote**: The exact user or assistant message that triggered extraction (truncated to ~100 chars if long)
- **Project**: Pre-fill from `writbase:info` if only one project is available. If multiple projects exist, ask the user to choose.
- **Department**: Pre-fill from `writbase:info` if only one department is available for the selected project. If multiple, ask the user to choose. If none are required, omit.

**If no task candidates are found**, output the following and stop:
> No untracked tasks found in this conversation.

Present candidates as a numbered list:

```
Found 3 potential tasks:

1. [high] Add rate limiting to the /api/upload endpoint
   Source: "we need to add rate limiting to upload before the release"
   Project: my-project | Department: engineering

2. [medium] Investigate flaky test in auth module
   Source: "the auth test has been failing intermittently"
   Project: my-project | Department: engineering

3. [low] Update README with new CLI commands
   Source: "should probably update the docs at some point"
   Project: my-project | Department: (none)
```

Ask the user to review: for each task, they can **approve**, **edit** (change description, priority, project, or department), or **skip**.

### Step 4b: Check for Duplicates

For each candidate, call `writbase:get_tasks` with `search` set to 2-3 key words from the description. If a matching task already exists, mark the candidate as **(possible duplicate of `<task_id>`)** in the presentation. The user decides whether to skip or create anyway.

### Step 5: Create Approved Tasks

For each approved task, call `writbase:add_task` with the confirmed parameters.

**Error recovery** — do not fail terminally on these errors. Instead, return to the user for correction:

| Error Code | Recovery |
|---|---|
| `scope_not_allowed` | Tell the user they lack permission for this project/department. Ask them to choose a different scope or skip. |
| `invalid_project` | Tell the user the project slug is invalid. Show available projects from Step 1 and ask them to choose. |
| `invalid_department` | Tell the user the department slug is invalid. Show available departments and ask them to choose. |
| `validation_error` | Show the `fields` object from the error. Ask the user to fix the description, priority, or other invalid field. |

For other errors (`rate_limited`, `unauthorized_agent_key`, `inactive_agent_key`), report the error and stop — these indicate infrastructure problems the user must fix outside this workflow.

### Step 6: Confirm Results

After all approved tasks are created, output a summary:

```
Created 2 tasks in WritBase:
- [high] Add rate limiting to the /api/upload endpoint (id: abc-123)
- [medium] Investigate flaky test in auth module (id: def-456)

Skipped 1 item.
```
