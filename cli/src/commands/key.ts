import { confirm, input, select } from '@inquirer/prompts';
import { createSpinner } from 'nanospinner';
import { loadConfig } from '../lib/config.js';
import { createAdminClient } from '../lib/supabase.js';
import { createAgentKey, listAgentKeys, rotateAgentKey, deactivateAgentKey } from '../lib/agent-keys.js';
import { success, error, warn, table } from '../lib/output.js';
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

export async function keyCreateCommand() {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  const name = await input({ message: 'Key name:' });
  if (!name.trim()) {
    error('Name is required');
    process.exit(1);
  }

  const role = await select<AgentRole>({
    message: 'Role:',
    choices: [
      { name: 'worker', value: 'worker' },
      { name: 'manager', value: 'manager' },
    ],
    default: 'worker',
  });

  // Fetch projects for optional scoping
  let projectId: string | null = null;
  let departmentId: string | null = null;

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', config.workspaceId)
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

  try {
    const { key, fullKey } = await createAgentKey(supabase, {
      name: name.trim(),
      role,
      workspaceId: config.workspaceId,
      projectId,
      departmentId,
    });

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

    console.log();
    warn('Save this key now — it cannot be retrieved later:');
    console.log();
    console.log(`  ${fullKey}`);
    console.log();
  } catch (err) {
    spinner.error({ text: 'Failed to create key' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
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
