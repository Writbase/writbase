import { webcrypto } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { createSpinner } from 'nanospinner';
import { loadConfigPartial, writeEnv } from '../lib/config.js';
import { createAdminClient } from '../lib/supabase.js';
import { success, error, info, warn } from '../lib/output.js';

export async function initCommand() {
  console.log();
  info('WritBase — Interactive Setup');
  console.log();

  // Check for existing .env
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const overwrite = await confirm({
      message: '.env file already exists. Reconfigure?',
      default: false,
    });
    if (!overwrite) return;
  }

  const existing = loadConfigPartial();
  let supabaseUrl = existing.supabaseUrl ?? '';
  let serviceRoleKey = existing.supabaseServiceRoleKey ?? '';
  let databaseUrl = existing.databaseUrl ?? '';

  // Determine Supabase source
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
      // Auto-detect from supabase status
      try {
        const statusJson = execSync('supabase status --output json', {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const status = JSON.parse(statusJson);
        supabaseUrl = status.API_URL ?? supabaseUrl;
        serviceRoleKey = status.SERVICE_ROLE_KEY ?? serviceRoleKey;
        databaseUrl = status.DB_URL ?? databaseUrl;
        success('Auto-detected local Supabase credentials');
      } catch {
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

  // Validate connection
  const spinner = createSpinner('Validating connection...').start();
  const supabase = createAdminClient(supabaseUrl, serviceRoleKey);

  try {
    const { error: connError } = await supabase
      .from('_does_not_exist')
      .select('*')
      .limit(1);

    // A "relation does not exist" error is fine — it means we connected.
    // An auth/network error is not.
    if (connError && !connError.message.includes('does not exist')) {
      spinner.error({ text: 'Connection failed' });
      error(connError.message);
      process.exit(1);
    }

    spinner.success({ text: 'Connection validated' });
  } catch (err) {
    spinner.error({ text: 'Connection failed' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Check schema state — try to query the workspaces table
  const { error: schemaError } = await supabase
    .from('workspaces')
    .select('id')
    .limit(1);

  const schemaExists = !schemaError;

  if (!schemaExists) {
    warn('Schema not initialized. Run `writbase migrate` first.');
    writeEnv({
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      DATABASE_URL: databaseUrl,
    });
    success('.env written (partial — no workspace yet)');
    console.log();
    info('Next steps:');
    console.log('  1. writbase migrate');
    console.log('  2. writbase init    (re-run to complete setup)');
    console.log();
    return;
  }

  // Workspace resolution
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name, slug');

  let workspaceId: string;

  if (workspaces && workspaces.length > 0) {
    if (workspaces.length === 1) {
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
    const spinner2 = createSpinner('Creating system user and workspace...').start();

    try {
      const { data: user, error: userError } = await supabase.auth.admin.createUser({
        email: 'system@writbase.local',
        password: webcrypto.randomUUID(),
        email_confirm: true,
      });

      let userId: string;

      if (userError) {
        if (userError.message?.includes('already') || userError.status === 422) {
          // User exists, look them up
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find(
            (u: { email?: string }) => u.email === 'system@writbase.local',
          );
          if (!existing) {
            spinner2.error({ text: 'Could not find existing system user' });
            process.exit(1);
          }
          userId = existing.id;
        } else {
          throw userError;
        }
      } else {
        userId = user.user.id;
      }

      // Wait briefly for trigger to fire
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Look up workspace created by trigger
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id, name, slug')
        .eq('owner_id', userId)
        .single();

      if (!ws) {
        spinner2.error({ text: 'Workspace not created by trigger' });
        error('The handle_new_user() trigger may not be set up. Run `writbase migrate` first.');
        process.exit(1);
      }

      workspaceId = ws.id;
      spinner2.success({ text: `Workspace created: ${ws.name}` });
    } catch (err) {
      spinner2.error({ text: 'Failed to create workspace' });
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Write .env
  writeEnv({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    DATABASE_URL: databaseUrl,
    WRITBASE_WORKSPACE_ID: workspaceId,
  });

  console.log();
  success('.env written');
  console.log();
  info('Next steps:');

  if (!schemaExists) {
    console.log('  1. writbase migrate');
    console.log('  2. writbase key create');
  } else {
    console.log('  1. writbase key create');
  }

  console.log('  Then: writbase status');
  console.log();
}
