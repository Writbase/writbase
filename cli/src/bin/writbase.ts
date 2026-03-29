#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { migrateCommand } from '../commands/migrate.js';
import {
  keyAddCommand,
  keyListCommand,
  keyRotateCommand,
  keyDeactivateCommand,
  keyPermitCommand,
} from '../commands/key.js';
import { statusCommand } from '../commands/status.js';

const program = new Command();

program
  .name('writbase')
  .description('WritBase CLI — agent-first task management')
  .version('0.3.1');

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
  .option('--name <name>', 'Key name')
  .option('--role <role>', 'Role: worker or manager')
  .option('--project <slug>', 'Default project (by slug)')
  .option('--department <slug>', 'Default department (by slug, requires --project)')
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
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(keyRotateCommand);

key
  .command('deactivate <name-or-id>')
  .description('Deactivate an agent key')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(keyDeactivateCommand);

key
  .command('permit <name-or-id>')
  .description('List or update permissions for an agent key')
  .option('--grant', 'Grant permissions (additive, preserves unspecified flags)')
  .option('--revoke', 'Revoke permission row')
  .option('--project <slug>', 'Project slug (required for --grant/--revoke)')
  .option('--department <slug>', 'Department slug (omit for project-wide)')
  .option('--can-read', 'Read permission')
  .option('--no-can-read', 'Remove read permission')
  .option('--can-create', 'Create permission')
  .option('--no-can-create', 'Remove create permission')
  .option('--can-update', 'Update permission')
  .option('--no-can-update', 'Remove update permission')
  .option('--can-assign', 'Assign permission')
  .option('--no-can-assign', 'Remove assign permission')
  .option('--can-comment', 'Comment permission')
  .option('--no-can-comment', 'Remove comment permission')
  .option('--can-archive', 'Archive permission')
  .option('--no-can-archive', 'Remove archive permission')
  .action(keyPermitCommand);

program
  .command('status')
  .description('Health check — verify connection and show counts')
  .action(statusCommand);

program.parse();
