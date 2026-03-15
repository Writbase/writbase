import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSpinner } from 'nanospinner';
import { success, error, warn } from './output.js';

const CONFIG_TOML = `project_id = "writbase"

[api]
enabled = false

[db]
port = 54322
major_version = 15

[auth]
enabled = false
`;

export type MigrateResult = 'applied' | 'no-cli' | 'failed';

export async function runMigrations(
  databaseUrl: string,
  opts?: { dryRun?: boolean; required?: boolean },
): Promise<MigrateResult> {
  // Check supabase CLI
  try {
    execSync('which supabase', { stdio: 'ignore' });
  } catch {
    if (opts?.required) {
      error('Supabase CLI not found. Install it: https://supabase.com/docs/guides/cli');
      process.exit(1);
    }
    return 'no-cli';
  }

  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const migrationsSource = join(packageRoot, 'migrations');

  const spinner = createSpinner('Running migrations...').start();
  const tmpDir = mkdtempSync(join(tmpdir(), 'writbase-migrate-'));

  try {
    const supabaseDir = join(tmpDir, 'supabase');
    mkdirSync(supabaseDir);
    writeFileSync(join(supabaseDir, 'config.toml'), CONFIG_TOML);
    cpSync(migrationsSource, join(supabaseDir, 'migrations'), { recursive: true });

    const args = [`--db-url "${databaseUrl}"`, `--workdir ${tmpDir}`];
    if (opts?.dryRun) args.push('--dry-run');

    const cmd = `supabase migration up ${args.join(' ')}`;

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    spinner.success({ text: 'Migrations applied' });

    if (output.trim()) {
      console.log(output.trim());
    }

    if (opts?.dryRun) {
      warn('Dry run — no changes applied');
    } else {
      success('Database schema is up to date');
    }

    return 'applied';
  } catch (err) {
    spinner.error({ text: 'Migration failed' });
    if (err instanceof Error && 'stderr' in err) {
      error(String((err as { stderr: unknown }).stderr));
    } else {
      error(err instanceof Error ? err.message : String(err));
    }
    if (opts?.required) {
      process.exit(1);
    }
    return 'failed';
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
