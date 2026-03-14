import dotenv from 'dotenv';
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { error } from './output.js';

export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  workspaceId: string;
}

export interface PartialConfig {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  databaseUrl?: string;
  workspaceId?: string;
}

export function loadConfigPartial(): PartialConfig {
  dotenv.config();
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: process.env.DATABASE_URL,
    workspaceId: process.env.WRITBASE_WORKSPACE_ID,
  };
}

export function loadConfig(): Config {
  const partial = loadConfigPartial();
  const missing: string[] = [];

  if (!partial.supabaseUrl) missing.push('SUPABASE_URL');
  if (!partial.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!partial.databaseUrl) missing.push('DATABASE_URL');
  if (!partial.workspaceId) missing.push('WRITBASE_WORKSPACE_ID');

  if (missing.length > 0) {
    error(`Missing required environment variables: ${missing.join(', ')}`);
    console.log('Run `writbase init` to configure.');
    process.exit(1);
  }

  return partial as Config;
}

export function writeEnv(vars: Record<string, string>) {
  const envPath = join(process.cwd(), '.env');
  const tmpPath = join(process.cwd(), '.env.tmp');

  const content = Object.entries(vars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';

  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, envPath);
}
