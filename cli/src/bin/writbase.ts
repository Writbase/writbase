#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { migrateCommand } from '../commands/migrate.js';
import {
  keyCreateCommand,
  keyListCommand,
  keyRotateCommand,
  keyDeactivateCommand,
} from '../commands/key.js';
import { statusCommand } from '../commands/status.js';

const program = new Command();

program
  .name('writbase')
  .description('WritBase CLI — agent-first task management')
  .version('0.1.0');

program
  .command('init')
  .description('Interactive setup — configure credentials and workspace')
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
  .command('create')
  .description('Create a new agent key')
  .action(keyCreateCommand);

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
