import { loadConfig } from '../lib/config.js';
import { runMigrations } from '../lib/migrate.js';

export async function migrateCommand(opts: { dryRun?: boolean }) {
  const config = loadConfig();
  await runMigrations(config.databaseUrl, { ...opts, required: true });
}
