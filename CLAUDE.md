## WritBase Task Context

WritBase tasks track work items for this project.

### Task Tracking (mandatory when doing task-related work)
- When working on tasks or features, follow the `writbase:worker` skill patterns.
- When starting non-trivial work (code changes, features, bug fixes), search for an existing
  task and update it, or create one. Skip for quick questions or exploratory reads.
- Update task status on completion (`done` with commit SHA) or when blocked.
- Before ending a session where WritBase tools were used, run `/extract-tasks`.

### Agent Team — WritBase Improvements

| Agent | Improvements | File Scope |
|-------|-------------|------------|
| **backend-agent** | #1 Task Dependencies (DAG), #7 Session Linking | `supabase/migrations/`, `supabase/functions/`, `src/lib/types/` |
| **hooks-agent** | #3 Teams Hook Sync, #5 HTTP Audit Trail | Hook scripts, settings, plugin hooks |
| **skills-agent** | #2 /loop Integration, #4 Context-Fence | Plugin skills directory |
| **frontend-agent** | #6 Mobile PWA | `src/app/`, `src/components/`, `public/`, `next.config.ts` |

Build: `npm run dev`, `npm run build`, `supabase db push`, `cd cli && npm run build`
