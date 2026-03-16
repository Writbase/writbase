#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { migrateCommand } from '../commands/migrate.js';
import {
  keyAddCommand,
  keyListCommand,
  keyRotateCommand,
  keyDeactivateCommand,
} from '../commands/key.js';
import { statusCommand } from '../commands/status.js';

const program = new Command();

program
  .name('writbase')
  .description('WritBase CLI — agent-first task management')
  .version('0.2.3');

program
  .command('init')
  .description('Configure credentials, migrate schema, and install skills')
  .option('--url <url>', 'Supabase URL')
  .option('--service-key <key>', 'Supabase service role key')
  .option('--db-url <url>', 'Database URL (postgresql://...)')
  .option('--local', 'Auto-detect credentials from local Supabase')
  .option('--force', 'Overwrite existing config without prompting')
  .action(initCommand);

program
  .command('migrate')
  .description('Apply database migrations via supabase migration up')
  .option('--dry-run', 'Show what would be applied without making changes')
  .action(migrateCommand);

const key = program
  .command('key')
  .description('Manage agent keys');

key
  .command('add')
  .description('Create an agent key, grant permissions, and optionally write .mcp.json')
  .option('--name <name>', 'Key name (non-interactive)')
  .option('--role <role>', 'Role: worker or manager (non-interactive)')
  .option('--mcp', 'Write .mcp.json to current directory')
  .option('--no-mcp', 'Skip writing .mcp.json')
  .action(keyAddCommand);

key
  .command('list')
  .description('List all agent keys')
  .action(keyListCommand);

key
  .command('rotate <name-or-id>')
  .description('Rotate an agent key (generates new secret)')
  .action(keyRotateCommand);

key
  .command('deactivate <name-or-id>')
  .description('Deactivate an agent key')
  .action(keyDeactivateCommand);

program
  .command('status')
  .description('Health check — verify connection and show counts')
  .action(statusCommand);

program.parse();
