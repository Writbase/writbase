# Task Execution Patterns

Concrete patterns for executing different types of tasks within the work loop. Each pattern follows the same structure: understand, execute, verify, report.

---

## Code Changes

Tasks that add features, refactor, or modify application behavior.

### Pattern

1. **Read** the relevant source files to understand existing patterns and conventions
2. **Plan** the change -- identify which files need modification and in what order
3. **Implement** focused changes that match the codebase style
4. **Lint/Test** -- run available linters or test suites to catch regressions
5. **Commit** with a descriptive message that references the task

### Completion Notes

```
Implemented <feature> in <file(s)>. Added <what was added>, updated <what changed>.
Tests pass. Commit <sha>.
```

### Example

Task: "Add validation for the due_date field in the task form"

```
1. Read src/components/task-form.tsx to understand current validation
2. Read src/lib/types/ to find existing date validation patterns
3. Add ISO 8601 date validation with user-friendly error message
4. Run npm run lint to verify no style issues
5. Commit: "Add due_date validation to task form"
```

Notes: "Added ISO 8601 date validation to TaskForm component in src/components/task-form.tsx. Invalid dates now show inline error. Commit abc1234."

---

## Bug Fixes

Tasks that describe broken behavior, errors, or regressions.

### Pattern

1. **Reproduce** -- read error logs, test output, or the described symptoms
2. **Locate** -- search the codebase for the relevant code path
3. **Diagnose** -- identify the root cause (not just the symptom)
4. **Fix** -- apply a minimal, targeted fix
5. **Verify** -- confirm the fix resolves the issue without side effects
6. **Commit** with a message that describes the fix and root cause

### Completion Notes

```
Fixed <symptom> caused by <root cause>. <What was changed and why>.
Commit <sha>.
```

### Example

Task: "API returns 500 when creating a task with no department"

```
1. Read the error description -- 500 on POST /api/tasks without department
2. Search for the task creation handler in src/lib/services/tasks.ts
3. Find that department_id is passed to the query without null check
4. Add conditional: only include department_id in the insert when provided
5. Test the fix with and without department parameter
6. Commit: "Fix 500 error when creating task without department"
```

Notes: "Fixed 500 error on task creation without department. Root cause: department_id was passed as undefined to the Supabase insert, which Postgres rejected as invalid UUID. Added null guard in src/lib/services/tasks.ts. Commit def5678."

---

## Documentation

Tasks that involve writing or updating documentation, comments, or inline help.

### Pattern

1. **Read** existing documentation to understand current state and style
2. **Identify** gaps between the docs and actual behavior
3. **Write/Update** documentation matching the existing tone and format
4. **Cross-reference** -- ensure links, code examples, and API references are accurate

### Completion Notes

```
Updated <which docs> to cover <what>. Added <new sections/examples>.
```

### Example

Task: "Document the assign_task tool parameters"

```
1. Read the existing worker skill docs for tool documentation patterns
2. Read the assign_task tool schema from the MCP server code
3. Add a section covering assign_task with parameter table and example
4. Verify all parameter names match the actual schema
```

Notes: "Added assign_task documentation to worker SKILL.md. Includes parameter table, permission requirements, and usage example showing cross-department assignment."

---

## Research and Analysis

Tasks that require investigation, comparison, or recommendation rather than code changes.

### Pattern

1. **Scope** -- clarify what question needs answering
2. **Search** -- use codebase search, file reading, and available references
3. **Analyze** -- synthesize findings into a clear answer
4. **Summarize** -- write findings into the task notes

### Status Rules

- Set `done` if the analysis is conclusive and actionable
- Set `blocked` if human input is needed to proceed (e.g., ambiguous requirements, access needed)

### Completion Notes

```
Analyzed <topic>. Found <key findings>. Recommendation: <action>.
```

### Example

Task: "Investigate why the event_log table is growing faster than expected"

```
1. Read the event_log schema and trigger definitions in supabase/migrations/
2. Search for all event_log insert calls across the codebase
3. Check if any operations produce multiple log entries per action
4. Summarize findings with data points
```

Notes: "Analyzed event_log growth. Found that update_task writes two event rows when both status and notes change in the same call (one per field change). This doubles write volume for common operations. Recommendation: batch field changes into a single event row with a changes array."

---

## Configuration and Infrastructure

Tasks involving environment setup, CI/CD, deployment configuration, or tooling.

### Pattern

1. **Read** current configuration files and understand the existing setup
2. **Identify** what needs to change and potential side effects
3. **Make** the configuration change
4. **Validate** -- run any available checks (build, deploy dry-run, config validation)
5. **Commit** with clear description of what changed and why

### Completion Notes

```
Updated <config/infra> to <what changed>. Validated by <how verified>.
Commit <sha>.
```

### Example

Task: "Add rate limit configuration for the MCP endpoint"

```
1. Read supabase/functions/mcp-server/middleware.ts for current rate limiting
2. Read supabase/functions/_shared/rate-limit.ts for the rate limit implementation
3. Add configurable limits via environment variable with sensible defaults
4. Verify the function still deploys correctly
5. Commit: "Add configurable rate limits for MCP endpoint"
```

Notes: "Added RATE_LIMIT_RPM env var to MCP endpoint (default: 60 req/min, unchanged from current behavior). Reads from Deno.env at function startup. Updated middleware.ts and added documentation comment. Commit ghi9012."

---

## General Rules

These apply to all task types:

- **Read first.** Never modify a file you have not read in this session.
- **Minimal changes.** Do the task, not adjacent cleanup (unless the task says to).
- **Match the style.** Follow existing code conventions, naming, and formatting.
- **Test when possible.** If there is a test suite, run it. If there are linters, run them.
- **Commit atomically.** One logical change per commit. Reference the task in the commit message.
- **Report honestly.** If something is partially done, say so. If a fix is a workaround, say so. Never claim completion for incomplete work.
