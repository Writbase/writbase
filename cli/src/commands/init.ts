import { webcrypto } from 'node:crypto';
import { execSync } from 'node:child_process';
import { confirm, input, select } from '@inquirer/prompts';
import { createSpinner } from 'nanospinner';
import { loadConfigPartial, writeConfig, WRITBASE_HOME } from '../lib/config.js';
import { createAdminClient } from '../lib/supabase.js';
import { installSkills } from '../lib/claude-code.js';
import { runMigrations } from '../lib/migrate.js';
import { success, error, info, warn } from '../lib/output.js';

interface InitOptions {
  url?: string;
  serviceKey?: string;
  dbUrl?: string;
  local?: boolean;
  force?: boolean;
}

function isNonInteractive(opts: InitOptions): boolean {
  return !!(opts.url || opts.local || opts.force);
}

function detectLocalSupabase(): { url: string; serviceKey: string; dbUrl: string } | null {
  try {
    const statusJson = execSync('supabase status --output json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const status = JSON.parse(statusJson);
    if (status.API_URL && status.SERVICE_ROLE_KEY) {
      return {
        url: status.API_URL,
        serviceKey: status.SERVICE_ROLE_KEY,
        dbUrl: status.DB_URL ?? '',
      };
    }
  } catch {
    // Not available
  }
  return null;
}

export async function initCommand(opts: InitOptions) {
  const headless = isNonInteractive(opts);

  console.log();
  info(headless ? 'WritBase — Non-Interactive Setup' : 'WritBase — Interactive Setup');
  console.log();

  // ── Load existing config (upgrade path) ──────────────────────────────

  const existing = loadConfigPartial();

  // Flags override stored values; stored values are defaults
  let supabaseUrl = opts.url ?? existing.supabaseUrl ?? '';
  let serviceRoleKey = opts.serviceKey ?? existing.supabaseServiceRoleKey ?? '';
  let databaseUrl = opts.dbUrl ?? existing.databaseUrl ?? '';

  // ── Resolve credentials ──────────────────────────────────────────────

  if (opts.url || opts.serviceKey || opts.dbUrl) {
    // Explicit flags provided — validate we have all three
    if (!supabaseUrl) {
      if (headless) {
        error('--url is required');
        process.exit(1);
      }
      supabaseUrl = await input({ message: 'Supabase URL:' });
    }
    if (!serviceRoleKey) {
      if (headless) {
        error('--service-key is required when using --url');
        process.exit(1);
      }
      serviceRoleKey = await input({ message: 'Service Role Key:' });
    }
    if (!databaseUrl) {
      if (headless) {
        error('--db-url is required when using --url');
        process.exit(1);
      }
      databaseUrl = await input({ message: 'Database URL (postgresql://...):' });
    }
  } else if (opts.local) {
    // Auto-detect from local Supabase
    const local = detectLocalSupabase();
    if (!local) {
      error('Could not auto-detect local Supabase. Is it running? (`supabase start`)');
      process.exit(1);
    }
    supabaseUrl = local.url;
    serviceRoleKey = local.serviceKey;
    databaseUrl = local.dbUrl;
    success('Auto-detected local Supabase credentials');
  } else if (supabaseUrl && serviceRoleKey && databaseUrl) {
    // Re-run with existing config — upgrade path
    info('Using existing configuration (upgrade mode)');
  } else {
    // Interactive flow — no existing config or incomplete
    const hasExisting = await confirm({
      message: 'Do you have an existing Supabase project?',
      default: true,
    });

    if (hasExisting) {
      const hosting = await select({
        message: 'Where is your Supabase instance?',
        choices: [
          { name: 'Hosted (supabase.co)', value: 'hosted' },
          { name: 'Local (supabase start)', value: 'local' },
        ],
      });

      if (hosting === 'local') {
        const local = detectLocalSupabase();
        if (local) {
          supabaseUrl = local.url;
          serviceRoleKey = local.serviceKey;
          databaseUrl = local.dbUrl;
          success('Auto-detected local Supabase credentials');
        } else {
          warn('Could not auto-detect. Please enter credentials manually.');
        }
      }

      if (!supabaseUrl) {
        supabaseUrl = await input({
          message: 'Supabase URL:',
          default: existing.supabaseUrl,
        });
      }

      if (!serviceRoleKey) {
        serviceRoleKey = await input({
          message: 'Service Role Key:',
          default: existing.supabaseServiceRoleKey,
        });
      }

      if (!databaseUrl) {
        databaseUrl = await input({
          message: 'Database URL (postgresql://...):',
          default: existing.databaseUrl,
        });
      }
    } else {
      // Need supabase CLI
      try {
        execSync('which supabase', { stdio: 'ignore' });
      } catch {
        error('Supabase CLI not found.');
        info('Install: https://supabase.com/docs/guides/cli');
        process.exit(1);
      }

      const startLocal = await confirm({
        message: 'Start a new local Supabase instance? (runs `supabase init` + `supabase start`)',
        default: true,
      });

      if (!startLocal) {
        info('Set up a Supabase project first, then run `writbase init` again.');
        return;
      }

      const spinner = createSpinner('Starting local Supabase...').start();
      try {
        execSync('supabase init --force', { stdio: 'ignore' });
        execSync('supabase start', { stdio: 'ignore', timeout: 120000 });
        const statusJson = execSync('supabase status --output json', {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const status = JSON.parse(statusJson);
        supabaseUrl = status.API_URL;
        serviceRoleKey = status.SERVICE_ROLE_KEY;
        databaseUrl = status.DB_URL;
        spinner.success({ text: 'Local Supabase started' });
      } catch (err) {
        spinner.error({ text: 'Failed to start Supabase' });
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  }

  // ── Validate connection ──────────────────────────────────────────────

  const connSpinner = createSpinner('Validating connection...').start();
  const supabase = createAdminClient(supabaseUrl, serviceRoleKey);

  try {
    const { error: connError } = await supabase
      .from('_does_not_exist')
      .select('*')
      .limit(1);

    // "table not found" errors mean we connected successfully
    const isTableNotFound = connError?.message.includes('does not exist')
      || connError?.message.includes('Could not find');
    if (connError && !isTableNotFound) {
      connSpinner.error({ text: 'Connection failed' });
      error(connError.message);
      process.exit(1);
    }

    connSpinner.success({ text: 'Connection validated' });
  } catch (err) {
    connSpinner.error({ text: 'Connection failed' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── Write partial config (needed for migrations) ─────────────────────

  writeConfig({
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
    databaseUrl,
  });

  // ── Auto-migrate ─────────────────────────────────────────────────────

  const migrateResult = await runMigrations(databaseUrl);

  if (migrateResult === 'no-cli') {
    // Check if schema already exists — if so, we can continue without CLI
    const { error: schemaError } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1);

    if (schemaError) {
      error('Schema not initialized and Supabase CLI not found for migrations.');
      info('Install supabase CLI: https://supabase.com/docs/guides/cli');
      info('Then run: writbase init');
      process.exit(1);
    }
    warn('Supabase CLI not found — skipping migrations (schema already exists)');
  } else if (migrateResult === 'failed') {
    error('Migration failed. Fix the issue and re-run `writbase init`.');
    process.exit(1);
  }

  // ── Workspace resolution ─────────────────────────────────────────────

  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name, slug');

  let workspaceId: string;

  if (workspaces && workspaces.length > 0) {
    if (workspaces.length === 1) {
      workspaceId = workspaces[0].id;
      info(`Using workspace: ${workspaces[0].name} (${workspaces[0].slug})`);
    } else if (headless) {
      workspaceId = workspaces[0].id;
      info(`Using workspace: ${workspaces[0].name} (${workspaces[0].slug})`);
    } else {
      workspaceId = await select({
        message: 'Select workspace:',
        choices: workspaces.map((w: { id: string; name: string; slug: string }) => ({
          name: `${w.name} (${w.slug})`,
          value: w.id,
        })),
      });
    }
  } else {
    // Create system user + workspace via trigger
    info('No workspaces found. Creating one...');
    const wsSpinner = createSpinner('Creating system user and workspace...').start();

    try {
      const { data: user, error: userError } = await supabase.auth.admin.createUser({
        email: 'system@writbase.local',
        password: webcrypto.randomUUID(),
        email_confirm: true,
      });

      let userId: string;

      if (userError) {
        if (userError.message?.includes('already') || userError.status === 422) {
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const found = existingUsers?.users?.find(
            (u: { email?: string }) => u.email === 'system@writbase.local',
          );
          if (!found) {
            wsSpinner.error({ text: 'Could not find existing system user' });
            process.exit(1);
          }
          userId = found.id;
        } else {
          throw userError;
        }
      } else {
        userId = user.user.id;
      }

      // Wait briefly for trigger to fire
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const { data: ws } = await supabase
        .from('workspaces')
        .select('id, name, slug')
        .eq('owner_id', userId)
        .single();

      if (!ws) {
        wsSpinner.error({ text: 'Workspace not created by trigger' });
        error('The handle_new_user() trigger may not be set up. Run `writbase migrate` first.');
        process.exit(1);
      }

      workspaceId = ws.id;
      wsSpinner.success({ text: `Workspace created: ${ws.name}` });
    } catch (err) {
      wsSpinner.error({ text: 'Failed to create workspace' });
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // ── Write full config with workspace ID ──────────────────────────────

  writeConfig({
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
    databaseUrl,
    workspaceId,
  });

  console.log();
  success(`Config written to ${WRITBASE_HOME}/config.json`);

  // ── Install skills + register plugin ─────────────────────────────────

  const skillsSpinner = createSpinner('Installing skills...').start();
  try {
    installSkills();
    skillsSpinner.success({ text: 'Skills installed and plugin registered' });
  } catch (err) {
    skillsSpinner.error({ text: 'Skills installation failed' });
    error(err instanceof Error ? err.message : String(err));
  }

  console.log();
  info('Next steps:');
  console.log('  writbase key create   (create an agent key)');
  console.log('  writbase status       (verify connection)');
  console.log();
}
