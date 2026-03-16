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
