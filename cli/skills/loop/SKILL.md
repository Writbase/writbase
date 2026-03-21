---
name: loop
description: Poll WritBase for top tasks and work through them autonomously. Use when you want to process the task queue, auto-work, or run the work loop.
---

# WritBase Autonomous Task Loop

Process the task queue sequentially: fetch the highest-priority task, do the work, mark it done, repeat.

## Prohibitions

- **Do not run in parallel.** Process one task at a time.
- **Do not skip the info call.** Always initialize with `writbase:info` first.
- **Do not mark tasks done with empty notes.** Every completion must describe what was accomplished.
- **Do not continue after 3 consecutive errors.** Stop and report.

## Initialization

### Step 1: Get Agent Identity

Call `writbase:info` to retrieve:

- Agent name, role, home project, home department
- Permission scopes (projects, departments, allowed actions)
- `special_prompt` -- if present, follow those instructions for the duration of the loop

### Step 2: Determine Scope

Resolve the project and department to poll:

1. If the user provided a project or department argument, use those
2. Otherwise use the home project and home department from the info response
3. If neither is available, ask the user to specify a project

Store the resolved `project` slug (and optionally `department` slug) for all subsequent calls.

## Loop Protocol

Execute the following loop until a stop condition is met:

### Step 1: Fetch Next Task

Call `writbase:get_top_tasks` with the scoped `project` (and `department` if set), `limit: 1`.

- If no tasks are returned: output "Queue empty. All actionable tasks are done or blocked." and **STOP**.
- If a task is returned: proceed with that task.

### Step 2: Claim the Task

Call `writbase:update_task` with:
- `task_id`: the task's `id`
- `version`: the task's current `version`
- `status`: `"in_progress"`

This signals to other agents that the task is being worked on.

### Step 3: Write Session State

Write the file `.claude/current-task.json` in the working directory:

```json
{
  "task_id": "<uuid>",
  "version": <version after claiming>,
  "description": "<task description>",
  "started_at": "<ISO 8601 timestamp>"
}
```

This file allows session recovery if the loop is interrupted.

### Step 4: Execute the Work

Read the task description and notes carefully. Then do the work:

- **Read before writing.** Always read relevant files before making changes.
- **Follow the description as the spec.** The task description defines what to do.
- **Make incremental progress.** Commit when you reach a logical checkpoint.
- **Use available tools.** Search the codebase, run tests, read documentation.
- **Stay focused.** Do what the task says, nothing more.

See [task-execution-patterns.md](references/task-execution-patterns.md) for concrete examples by task type.

### Step 5: Complete or Block

**If work is complete:**

1. Call `writbase:update_task` with:
   - `status`: `"done"`
   - `notes`: A meaningful summary of what was accomplished (include commit SHAs if applicable)
2. Delete `.claude/current-task.json`
3. Reset the consecutive error counter to 0

**If work cannot be completed:**

1. Call `writbase:update_task` with:
   - `status`: `"blocked"`
   - `notes`: A clear explanation of the blocker (what is needed, who can unblock it)
2. Delete `.claude/current-task.json`

### Step 6: Loop

Return to Step 1 to fetch the next task.

## Error Handling

Handle errors from any MCP call using these rules:

### `version_conflict`

Re-fetch the task via `writbase:get_tasks` with `search` set to the task ID. Retry the update with the `current_version` from the error response. Retry up to 3 times before skipping the task with a warning.

### `rate_limited`

Wait the number of seconds specified in `retry_after`, then retry the same call.

### `scope_not_allowed`

Log the error (include the task ID and the missing permission). Skip this task and continue to the next iteration. Do not retry.

### All Other Errors

Increment the consecutive error counter. If the counter reaches 3, **STOP** and output a summary:

```
Stopping: 3 consecutive errors.
Last error: <error code> -- <error message>
Tasks completed this session: <count>
```

The consecutive error counter resets to 0 after any successful task completion (Step 5).

## Stop Conditions

The loop stops when any of these conditions is met:

1. **Queue empty** -- `get_top_tasks` returns no tasks
2. **User interrupt** -- the user presses Ctrl-C or types "stop"
3. **Circuit breaker** -- 3 consecutive errors without a successful completion
4. **Context pressure** -- if the conversation is getting long, suggest stopping to resume fresh rather than risking degraded output quality

When stopping, always output a session summary:

```
Loop complete.
Tasks completed: <n>
Tasks blocked: <n>
Tasks skipped (errors): <n>
```

## Recovery After Interruption

On startup, before entering the loop, check if `.claude/current-task.json` exists:

1. If it exists, read the file to get the interrupted task's ID and version
2. Fetch the task via `writbase:get_tasks` with `search` set to the task ID
3. If the task is still `in_progress`, ask the user: resume this task or reset it to `todo`?
4. If the task has moved to another status (another agent picked it up), delete the state file and proceed normally

## Important Notes

- Always verify you have the tools and file access needed before starting work on a task
- For code tasks: read files first, make changes, run tests if available, commit with a descriptive message
- For research tasks: use search tools, summarize findings in task notes
- Completion notes must be meaningful -- "Done" is not acceptable. Describe what was accomplished, which files changed, and include commit SHAs when relevant
- If a task description is ambiguous, set it to `blocked` with notes asking for clarification rather than guessing
- Do not modify tasks outside your scoped project/department
