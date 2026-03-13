/**
 * Seed script for exampleproject-ops project.
 *
 * Creates:
 *   - Project: exampleproject (slug: exampleproject)
 *   - Departments: ops, core
 *   - Agent keys: exampleproject-ops-agent, exampleproject-core-agent
 *   - Permissions: cross-department collaboration with can_comment
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> deno run --allow-net --allow-env scripts/seed-exampleproject.ts
 *
 * Environment:
 *   SUPABASE_URL              - Default: http://127.0.0.1:54321
 *   SUPABASE_SERVICE_ROLE_KEY - Required
 *   WORKSPACE_ID              - Optional (auto-detected if exactly one workspace)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required.')
  Deno.exit(1)
}

// ── Crypto helpers ──────────────────────────────────────────────────

async function hashSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function generateAgentKey(): Promise<{
  fullKey: string
  keyId: string
  keyHash: string
  keyPrefix: string
}> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const keyId = crypto.randomUUID()
  const keyHash = await hashSecret(secret)
  const keyPrefix = secret.slice(0, 8)
  return { fullKey: `wb_${keyId}_${secret}`, keyId, keyHash, keyPrefix }
}

// ── REST helpers ────────────────────────────────────────────────────

async function rest(
  table: string,
  opts: {
    method?: string
    body?: unknown
    query?: string
    headers?: Record<string, string>
    prefer?: string
  } = {},
): Promise<unknown> {
  const method = opts.method ?? 'GET'
  const url = `${SUPABASE_URL}/rest/v1/${table}${opts.query ? `?${opts.query}` : ''}`
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...opts.headers,
  }
  if (opts.prefer) headers['Prefer'] = opts.prefer
  if (opts.body && !opts.prefer) headers['Prefer'] = 'return=representation'

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${table} failed (${res.status}): ${text}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── Resolve workspace ───────────────────────────────────────────────

async function resolveWorkspace(): Promise<string> {
  const envId = Deno.env.get('WORKSPACE_ID')
  if (envId) return envId

  const workspaces = await rest('workspaces', {
    query: 'select=id,name',
  }) as { id: string; name: string }[]

  if (workspaces.length === 0) {
    console.error('ERROR: No workspaces found. Sign up via the dashboard first.')
    Deno.exit(1)
  }
  if (workspaces.length > 1) {
    console.error('ERROR: Multiple workspaces found. Set WORKSPACE_ID env var.')
    console.error('Available workspaces:')
    for (const w of workspaces) {
      console.error(`  ${w.id} — ${w.name}`)
    }
    Deno.exit(1)
  }
  return workspaces[0].id
}

// ── Idempotent getOrCreate helpers ──────────────────────────────────

interface ProjectRow { id: string; slug: string; name: string }
interface DepartmentRow { id: string; slug: string; name: string }
interface AgentKeyRow { id: string; name: string }

async function getOrCreateProject(workspaceId: string, name: string, slug: string): Promise<ProjectRow> {
  const existing = await rest('projects', {
    query: `workspace_id=eq.${workspaceId}&slug=eq.${slug}&select=id,slug,name`,
  }) as ProjectRow[]

  if (existing.length > 0) {
    console.log(`  Project "${slug}" already exists (${existing[0].id})`)
    return existing[0]
  }

  const [created] = await rest('projects', {
    method: 'POST',
    body: { name, slug, workspace_id: workspaceId },
    prefer: 'return=representation',
  }) as ProjectRow[]

  console.log(`  Created project "${slug}" (${created.id})`)
  return created
}

async function getOrCreateDepartment(workspaceId: string, name: string, slug: string): Promise<DepartmentRow> {
  const existing = await rest('departments', {
    query: `workspace_id=eq.${workspaceId}&slug=eq.${slug}&select=id,slug,name`,
  }) as DepartmentRow[]

  if (existing.length > 0) {
    console.log(`  Department "${slug}" already exists (${existing[0].id})`)
    return existing[0]
  }

  const [created] = await rest('departments', {
    method: 'POST',
    body: { name, slug, workspace_id: workspaceId },
    prefer: 'return=representation',
  }) as DepartmentRow[]

  console.log(`  Created department "${slug}" (${created.id})`)
  return created
}

async function getOrCreateAgentKey(
  workspaceId: string,
  name: string,
  createdBy: string,
  defaults?: { defaultProjectId: string; defaultDepartmentId: string },
): Promise<{ row: AgentKeyRow; fullKey: string | null; isNew: boolean }> {
  const existing = await rest('agent_keys', {
    query: `workspace_id=eq.${workspaceId}&name=eq.${encodeURIComponent(name)}&select=id,name`,
  }) as AgentKeyRow[]

  if (existing.length > 0) {
    console.log(`  Agent key "${name}" already exists (${existing[0].id})`)
    console.log(`    WARNING: Secret is not recoverable. Delete and re-run to regenerate.`)
    // Patch defaults if provided (idempotent)
    if (defaults) {
      await rest('agent_keys', {
        method: 'PATCH',
        query: `id=eq.${existing[0].id}`,
        body: {
          default_project_id: defaults.defaultProjectId,
          default_department_id: defaults.defaultDepartmentId,
        },
      })
      console.log(`    Updated defaults on existing key`)
    }
    return { row: existing[0], fullKey: null, isNew: false }
  }

  const { fullKey, keyId, keyHash, keyPrefix } = await generateAgentKey()

  const [created] = await rest('agent_keys', {
    method: 'POST',
    body: {
      id: keyId,
      name,
      role: 'worker',
      key_hash: keyHash,
      key_prefix: keyPrefix,
      is_active: true,
      workspace_id: workspaceId,
      created_by: createdBy,
      ...(defaults && {
        default_project_id: defaults.defaultProjectId,
        default_department_id: defaults.defaultDepartmentId,
      }),
    },
    prefer: 'return=representation',
  }) as AgentKeyRow[]

  console.log(`  Created agent key "${name}" (${created.id})`)
  return { row: created, fullKey, isNew: true }
}

async function upsertPermissions(
  workspaceId: string,
  agentKeyId: string,
  permissions: Array<{
    project_id: string
    department_id: string | null
    can_read: boolean
    can_create: boolean
    can_update: boolean
    can_assign: boolean
    can_comment: boolean
  }>,
): Promise<void> {
  // Delete existing permissions for this key, then insert fresh
  await rest('agent_permissions', {
    method: 'DELETE',
    query: `agent_key_id=eq.${agentKeyId}`,
    prefer: 'return=minimal',
    headers: { Prefer: 'return=minimal' },
  })

  const rows = permissions.map((p) => ({
    agent_key_id: agentKeyId,
    workspace_id: workspaceId,
    ...p,
  }))

  await rest('agent_permissions', {
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
    headers: { Prefer: 'return=representation' },
  })
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding exampleproject-ops...\n')

  const workspaceId = await resolveWorkspace()
  console.log(`Workspace: ${workspaceId}\n`)

  // Find the workspace owner for created_by
  const members = await rest('workspace_members', {
    query: `workspace_id=eq.${workspaceId}&role=eq.owner&select=user_id`,
  }) as { user_id: string }[]
  const ownerId = members[0]?.user_id ?? '00000000-0000-0000-0000-000000000000'

  // 1. Project + departments
  console.log('Creating project & departments...')
  const project = await getOrCreateProject(workspaceId, 'ExampleProject', 'exampleproject')
  const opsDept = await getOrCreateDepartment(workspaceId, 'Ops', 'ops')
  const coreDept = await getOrCreateDepartment(workspaceId, 'Core', 'core')

  // 2. Agent keys
  console.log('\nCreating agent keys...')
  const opsAgent = await getOrCreateAgentKey(workspaceId, 'exampleproject-ops-agent', ownerId, {
    defaultProjectId: project.id,
    defaultDepartmentId: opsDept.id,
  })
  const coreAgent = await getOrCreateAgentKey(workspaceId, 'exampleproject-core-agent', ownerId, {
    defaultProjectId: project.id,
    defaultDepartmentId: coreDept.id,
  })

  // 3. Permissions
  console.log('\nSetting permissions...')

  // ops-agent: full on ops, read+create+comment on core
  await upsertPermissions(workspaceId, opsAgent.row.id, [
    {
      project_id: project.id,
      department_id: opsDept.id,
      can_read: true,
      can_create: true,
      can_update: true,
      can_assign: false,
      can_comment: false,
    },
    {
      project_id: project.id,
      department_id: coreDept.id,
      can_read: true,
      can_create: true,
      can_update: false,
      can_assign: false,
      can_comment: true,
    },
  ])
  console.log(`  ops-agent permissions set`)

  // core-agent: full on core, read+create+comment on ops
  await upsertPermissions(workspaceId, coreAgent.row.id, [
    {
      project_id: project.id,
      department_id: coreDept.id,
      can_read: true,
      can_create: true,
      can_update: true,
      can_assign: false,
      can_comment: false,
    },
    {
      project_id: project.id,
      department_id: opsDept.id,
      can_read: true,
      can_create: true,
      can_update: false,
      can_assign: false,
      can_comment: true,
    },
  ])
  console.log(`  core-agent permissions set`)

  // 4. Ensure app_settings exist for workspace
  const existingSettings = await rest('app_settings', {
    query: `workspace_id=eq.${workspaceId}&select=id`,
  }) as { id: string }[]
  if (existingSettings.length === 0) {
    await rest('app_settings', {
      method: 'POST',
      body: { workspace_id: workspaceId },
      prefer: 'return=representation',
    })
    console.log('\n  Created app_settings for workspace')
  }

  // 5. Print keys
  console.log('\n' + '='.repeat(60))
  console.log('AGENT KEYS')
  console.log('='.repeat(60))
  if (opsAgent.fullKey) {
    console.log(`\n  exampleproject-ops-agent:`)
    console.log(`    ${opsAgent.fullKey}`)
  } else {
    console.log(`\n  exampleproject-ops-agent: (already existed — secret not available)`)
  }
  if (coreAgent.fullKey) {
    console.log(`\n  exampleproject-core-agent:`)
    console.log(`    ${coreAgent.fullKey}`)
  } else {
    console.log(`\n  exampleproject-core-agent: (already existed — secret not available)`)
  }
  console.log('\n' + '='.repeat(60))
  console.log('Done!')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  Deno.exit(1)
})
