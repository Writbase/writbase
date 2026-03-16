import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { createSpinner } from 'nanospinner';
import { loadConfig } from '../lib/config.js';
import { createAdminClient } from '../lib/supabase.js';
import { createAgentKey, listAgentKeys, rotateAgentKey, deactivateAgentKey } from '../lib/agent-keys.js';
import { logEvent } from '../lib/event-log.js';
import { success, error, warn, info, table } from '../lib/output.js';
import type { AgentRole } from '../lib/types.js';

async function resolveKeyByNameOrId(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  nameOrId: string,
) {
  const keys = await listAgentKeys(supabase, workspaceId);
  // Try exact name match first
  const byName = keys.find(
    (k: { name: string }) => k.name.toLowerCase() === nameOrId.toLowerCase(),
  );
  if (byName) return byName;
  // Try ID prefix match
  const byId = keys.filter((k: { id: string }) => k.id.startsWith(nameOrId));
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) {
    error(`Ambiguous ID prefix "${nameOrId}" — matches ${byId.length} keys`);
    process.exit(1);
  }
  error(`No agent key found matching "${nameOrId}"`);
  process.exit(1);
}

interface KeyAddOptions {
  name?: string;
  role?: string;
  mcp?: boolean;
}

export async function keyAddCommand(opts: KeyAddOptions) {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const headless = !!(opts.name || opts.role || opts.mcp === true || opts.mcp === false);

  const nameInput = opts.name ?? await input({ message: 'Key name:' });
  if (!nameInput.trim()) {
    error('Name is required');
    process.exit(1);
  }

  let role: AgentRole;
  if (opts.role) {
    if (opts.role !== 'worker' && opts.role !== 'manager') {
      error(`Invalid role: "${opts.role}". Must be "worker" or "manager".`);
      process.exit(1);
    }
    role = opts.role;
  } else {
    role = await select<AgentRole>({
      message: 'Role:',
      choices: [
        { name: 'worker', value: 'worker' },
        { name: 'manager', value: 'manager' },
      ],
      default: 'worker',
    });
  }

  // Fetch projects for optional scoping
  let projectId: string | null = null;
  let departmentId: string | null = null;

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('workspace_id', config.workspaceId)
    .eq('is_archived', false)
    .order('name');

  if (projects && projects.length > 0) {
    const projectChoice = await select({
      message: 'Default project (optional):',
      choices: [
        { name: '(none)', value: '' },
        ...projects.map((p: { id: string; name: string }) => ({
          name: p.name,
          value: p.id,
        })),
      ],
    });

    if (projectChoice) {
      projectId = projectChoice;

      // Fetch departments for this project
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .eq('project_id', projectId)
        .order('name');

      if (departments && departments.length > 0) {
        const deptChoice = await select({
          message: 'Default department (optional):',
          choices: [
            { name: '(none)', value: '' },
            ...departments.map((d: { id: string; name: string }) => ({
              name: d.name,
              value: d.id,
            })),
          ],
        });

        if (deptChoice) departmentId = deptChoice;
      }
    }
  }

  const spinner = createSpinner('Creating agent key...').start();

  let keyId: string;
  let fullKey: string;

  try {
    const { key, fullKey: fk } = await createAgentKey(supabase, {
      name: nameInput.trim(),
      role,
      workspaceId: config.workspaceId,
      projectId,
      departmentId,
    });

    keyId = key.id;
    fullKey = fk;

    spinner.success({ text: 'Agent key created' });
    console.log();

    table(
      ['Field', 'Value'],
      [
        ['Name', key.name],
        ['Role', key.role],
        ['ID', key.id],
        ['Prefix', key.key_prefix],
        ['Active', String(key.is_active)],
      ],
    );
  } catch (err) {
    spinner.error({ text: 'Failed to create key' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── Grant permissions for all active projects ──────────────────────

  const projectIds = projects?.map((p: { id: string }) => p.id) ?? [];

  if (projectIds.length > 0) {
    try {
      const rows = projectIds.map((pid: string) => ({
        agent_key_id: keyId,
        project_id: pid,
        workspace_id: config.workspaceId,
        can_read: true,
        can_create: true,
        can_update: true,
        can_assign: role === 'manager',
        can_comment: false,
        can_archive: role === 'manager',
      }));

      const { error: permError } = await supabase
        .from('agent_permissions')
        .upsert(rows, { onConflict: 'agent_key_id,project_id,department_id' });

      if (permError) throw permError;

      await logEvent(supabase, {
        eventCategory: 'admin',
        targetType: 'agent_key',
        targetId: keyId,
        eventType: 'agent_permission.granted',
        actorType: 'system',
        actorId: 'writbase-cli',
        actorLabel: 'writbase-cli',
        source: 'system',
        workspaceId: config.workspaceId,
      });

      const projectNames = projects!.map((p: { name: string; slug: string }) => `${p.name} (${p.slug})`);
      success(`Permissions granted for ${projectIds.length} project(s): ${projectNames.join(', ')}`);
    } catch (err) {
      warn(`Failed to grant permissions: ${err instanceof Error ? err.message : String(err)}`);
      info('Grant permissions manually via the dashboard or `writbase:manage_agent_permissions`');
    }
  } else {
    warn('No projects found. Create a project first, then grant permissions.');
  }

  // ── Write .mcp.json to current directory (optional) ─────────────

  let writeMcp: boolean;
  if (opts.mcp === true) {
    writeMcp = true;
  } else if (opts.mcp === false) {
    writeMcp = false;
  } else if (headless) {
    writeMcp = false;
  } else {
    writeMcp = await confirm({
      message: `Write .mcp.json to ${process.cwd()}?`,
      default: true,
    });
  }

  if (writeMcp) {
    const mcpUrl = `${config.supabaseUrl}/functions/v1/mcp-server`;
    const mcpPath = join(process.cwd(), '.mcp.json');

    // Merge with existing .mcp.json if present
    let mcpConfig: Record<string, unknown> = {};
    if (existsSync(mcpPath)) {
      try {
        mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      } catch {
        // Corrupted — overwrite
      }
    }

    mcpConfig.writbase = {
      type: 'http',
      url: mcpUrl,
      headers: {
        Authorization: `Bearer ${fullKey}`,
      },
    };

    const mcpTmpPath = mcpPath + '.tmp';
    writeFileSync(mcpTmpPath, JSON.stringify(mcpConfig, null, 2) + '\n', { mode: 0o600 });
    renameSync(mcpTmpPath, mcpPath);

    success(`MCP config written to ${mcpPath}`);
  }

  console.log();
  warn('Save this key now — it cannot be retrieved later:');
  console.log();
  console.log(`  ${fullKey}`);
  console.log();
}

export async function keyListCommand() {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const spinner = createSpinner('Fetching agent keys...').start();

  try {
    const keys = await listAgentKeys(supabase, config.workspaceId);
    spinner.success({ text: `Found ${keys.length} key(s)` });

    if (keys.length === 0) return;

    console.log();
    table(
      ['Name', 'Role', 'Prefix', 'Active', 'Created'],
      keys.map((k: { name: string; role: string; key_prefix: string; is_active: boolean; created_at: string }) => [
        k.name,
        k.role,
        k.key_prefix,
        k.is_active ? 'yes' : 'no',
        new Date(k.created_at).toLocaleDateString(),
      ]),
    );
  } catch (err) {
    spinner.error({ text: 'Failed to list keys' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function keyRotateCommand(nameOrId: string) {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const key = await resolveKeyByNameOrId(supabase, config.workspaceId, nameOrId);

  const confirmed = await confirm({
    message: `Rotate key "${key.name}" (${key.key_prefix}...)? The old key will stop working immediately.`,
    default: false,
  });

  if (!confirmed) return;

  const spinner = createSpinner('Rotating key...').start();

  try {
    const { fullKey } = await rotateAgentKey(supabase, {
      id: key.id,
      workspaceId: config.workspaceId,
    });

    spinner.success({ text: 'Key rotated' });
    console.log();
    warn('Save this new key — it cannot be retrieved later:');
    console.log();
    console.log(`  ${fullKey}`);
    console.log();
  } catch (err) {
    spinner.error({ text: 'Failed to rotate key' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── permit helpers ────────────────────────────────────────────────

async function resolveProjectBySlug(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  slug: string,
) {
  const { data: project, error: err } = await supabase
    .from('projects')
    .select('id, name, slug, is_archived')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (err || !project) {
    const { data: all } = await supabase
      .from('projects')
      .select('slug')
      .eq('workspace_id', workspaceId)
      .order('slug');
    const slugs = all?.map((p: { slug: string }) => p.slug).join(', ') ?? '(none)';
    error(`Project "${slug}" not found. Available: ${slugs}`);
    process.exit(1);
  }
  return project;
}

async function resolveDepartmentBySlug(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  slug: string,
) {
  const { data: dept, error: err } = await supabase
    .from('departments')
    .select('id, name, slug, is_archived')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (err || !dept) {
    const { data: all } = await supabase
      .from('departments')
      .select('slug')
      .eq('workspace_id', workspaceId)
      .order('slug');
    const slugs = all?.map((d: { slug: string }) => d.slug).join(', ') ?? '(none)';
    error(`Department "${slug}" not found. Available: ${slugs}`);
    process.exit(1);
  }
  return dept;
}

const PERM_FLAGS = ['canRead', 'canCreate', 'canUpdate', 'canAssign', 'canComment', 'canArchive'] as const;
const PERM_DB_COLS = ['can_read', 'can_create', 'can_update', 'can_assign', 'can_comment', 'can_archive'] as const;

interface KeyPermitOptions {
  grant?: boolean;
  revoke?: boolean;
  project?: string;
  department?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canAssign?: boolean;
  canComment?: boolean;
  canArchive?: boolean;
}

export async function keyPermitCommand(nameOrId: string, opts: KeyPermitOptions) {
  // ── Validation ──────────────────────────────────────────────────
  if (opts.grant && opts.revoke) {
    error('Cannot use --grant and --revoke together');
    process.exit(1);
  }

  const hasAnyPermFlag = PERM_FLAGS.some((f) => opts[f] !== undefined);

  if (opts.grant && !hasAnyPermFlag) {
    error('--grant requires at least one permission flag: --can-read, --can-create, --can-update, --can-assign, --can-comment, --can-archive (or --no-can-* to remove)');
    process.exit(1);
  }

  if (hasAnyPermFlag && !opts.grant) {
    error('Permission flags (--can-*) require --grant');
    process.exit(1);
  }

  if ((opts.grant || opts.revoke) && !opts.project) {
    error('--project is required with --grant/--revoke');
    process.exit(1);
  }

  if (opts.department && !opts.project) {
    error('--department requires --project');
    process.exit(1);
  }

  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const key = await resolveKeyByNameOrId(supabase, config.workspaceId, nameOrId);

  // ── List (default) ──────────────────────────────────────────────
  if (!opts.grant && !opts.revoke) {
    const spinner = createSpinner('Fetching permissions...').start();

    const { data: perms, error: err } = await supabase
      .from('agent_permissions')
      .select('*, projects:project_id(name, slug, is_archived), departments:department_id(name, slug, is_archived)')
      .eq('agent_key_id', key.id)
      .eq('workspace_id', config.workspaceId);

    if (err) {
      spinner.error({ text: 'Failed to fetch permissions' });
      error(err.message);
      process.exit(1);
    }

    spinner.success({ text: `${perms.length} permission row(s) for "${key.name}"` });

    if (perms.length === 0) {
      info('No permissions granted. Use --grant to add permissions.');
      return;
    }

    console.log();
    const yn = (v: boolean) => (v ? 'yes' : 'no');
    table(
      ['Project', 'Department', 'read', 'create', 'update', 'assign', 'comment', 'archive'],
      perms.map((p: Record<string, unknown>) => {
        const proj = p.projects as { name: string; slug: string; is_archived: boolean } | null;
        const dept = p.departments as { name: string; slug: string; is_archived: boolean } | null;
        const projLabel = proj ? `${proj.slug}${proj.is_archived ? ' (archived)' : ''}` : '(unknown)';
        const deptLabel = dept ? `${dept.slug}${dept.is_archived ? ' (archived)' : ''}` : '(all)';
        return [
          projLabel,
          deptLabel,
          yn(p.can_read as boolean),
          yn(p.can_create as boolean),
          yn(p.can_update as boolean),
          yn(p.can_assign as boolean),
          yn(p.can_comment as boolean),
          yn(p.can_archive as boolean),
        ];
      }),
    );
    return;
  }

  // ── Resolve project & department ────────────────────────────────
  const project = await resolveProjectBySlug(supabase, config.workspaceId, opts.project!);
  if (project.is_archived) warn(`Project "${project.slug}" is archived`);

  let departmentId: string | null = null;
  if (opts.department) {
    const dept = await resolveDepartmentBySlug(supabase, config.workspaceId, opts.department);
    if (dept.is_archived) warn(`Department "${dept.slug}" is archived`);
    departmentId = dept.id;
  }

  // ── Grant ───────────────────────────────────────────────────────
  if (opts.grant) {
    if (!key.is_active) {
      error(`Key "${key.name}" is inactive — cannot grant permissions to inactive keys`);
      process.exit(1);
    }

    const spinner = createSpinner('Granting permissions...').start();

    // Fetch existing row
    let query = supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_key_id', key.id)
      .eq('project_id', project.id)
      .eq('workspace_id', config.workspaceId);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    // Merge: CLI value if specified, else existing, else false
    const merged: Record<string, unknown> = {
      agent_key_id: key.id,
      project_id: project.id,
      department_id: departmentId,
      workspace_id: config.workspaceId,
    };

    for (let i = 0; i < PERM_FLAGS.length; i++) {
      const flag = PERM_FLAGS[i];
      const col = PERM_DB_COLS[i];
      if (opts[flag] !== undefined) {
        merged[col] = opts[flag];
      } else if (existing) {
        merged[col] = existing[col];
      } else {
        merged[col] = false;
      }
    }

    const { error: upsertErr } = await supabase
      .from('agent_permissions')
      .upsert(merged, { onConflict: 'agent_key_id,project_id,department_id' });

    if (upsertErr) {
      spinner.error({ text: 'Failed to grant permissions' });
      error(upsertErr.message);
      process.exit(1);
    }

    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'agent_key',
      targetId: key.id,
      eventType: 'agent_permission.granted',
      actorType: 'system',
      actorId: 'writbase-cli',
      actorLabel: 'writbase-cli',
      source: 'system',
      workspaceId: config.workspaceId,
    });

    spinner.success({ text: 'Permissions granted' });

    const scope = opts.department ? `${opts.project}/${opts.department}` : opts.project!;
    const granted = PERM_FLAGS
      .filter((f) => merged[PERM_DB_COLS[PERM_FLAGS.indexOf(f)]] === true)
      .map((f) => f.replace('can', '').toLowerCase());
    success(`${key.name} → ${scope}: ${granted.join(', ') || '(none)'}`);
    return;
  }

  // ── Revoke ──────────────────────────────────────────────────────
  if (opts.revoke) {
    const spinner = createSpinner('Revoking permissions...').start();

    let query = supabase
      .from('agent_permissions')
      .delete()
      .eq('agent_key_id', key.id)
      .eq('project_id', project.id)
      .eq('workspace_id', config.workspaceId);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    const { data, error: delErr } = await query.select();

    if (delErr) {
      spinner.error({ text: 'Failed to revoke permissions' });
      error(delErr.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      spinner.warn({ text: 'No matching permission row found' });
      return;
    }

    await logEvent(supabase, {
      eventCategory: 'admin',
      targetType: 'agent_key',
      targetId: key.id,
      eventType: 'agent_permission.revoked',
      actorType: 'system',
      actorId: 'writbase-cli',
      actorLabel: 'writbase-cli',
      source: 'system',
      workspaceId: config.workspaceId,
    });

    spinner.success({ text: 'Permission revoked' });
    const scope = opts.department ? `${opts.project}/${opts.department}` : opts.project!;
    success(`Revoked ${key.name} → ${scope}`);
  }
}

export async function keyDeactivateCommand(nameOrId: string) {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const key = await resolveKeyByNameOrId(supabase, config.workspaceId, nameOrId);

  if (!key.is_active) {
    warn(`Key "${key.name}" is already inactive`);
    return;
  }

  const confirmed = await confirm({
    message: `Deactivate key "${key.name}" (${key.key_prefix}...)? This key will stop working immediately.`,
    default: false,
  });

  if (!confirmed) return;

  const spinner = createSpinner('Deactivating key...').start();

  try {
    await deactivateAgentKey(supabase, {
      id: key.id,
      workspaceId: config.workspaceId,
    });

    spinner.success({ text: `Key "${key.name}" deactivated` });
  } catch (err) {
    spinner.error({ text: 'Failed to deactivate key' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
