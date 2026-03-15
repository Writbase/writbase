import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { error } from './output.js';

export const WRITBASE_HOME = join(homedir(), '.writbase');

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

/** Read config.json; falls back to legacy .env if config.json doesn't exist. */
export function loadConfigPartial(): PartialConfig {
  const jsonPath = join(WRITBASE_HOME, 'config.json');

  if (existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      return {
        supabaseUrl: raw.supabaseUrl,
        supabaseServiceRoleKey: raw.supabaseServiceRoleKey,
        databaseUrl: raw.databaseUrl,
        workspaceId: raw.workspaceId,
      };
    } catch {
      // Corrupted JSON — fall through to .env
    }
  }

  // Legacy .env fallback
  const envPath = join(WRITBASE_HOME, '.env');
  if (existsSync(envPath)) {
    const vars: Record<string, string> = {};
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) vars[match[1]] = match[2];
    }
    return {
      supabaseUrl: vars.SUPABASE_URL,
      supabaseServiceRoleKey: vars.SUPABASE_SERVICE_ROLE_KEY,
      databaseUrl: vars.DATABASE_URL,
      workspaceId: vars.WRITBASE_WORKSPACE_ID,
    };
  }

  return {};
}

export function loadConfig(): Config {
  const partial = loadConfigPartial();
  const missing: string[] = [];

  if (!partial.supabaseUrl) missing.push('supabaseUrl');
  if (!partial.supabaseServiceRoleKey) missing.push('supabaseServiceRoleKey');
  if (!partial.databaseUrl) missing.push('databaseUrl');
  if (!partial.workspaceId) missing.push('workspaceId');

  if (missing.length > 0) {
    error(`Missing config fields: ${missing.join(', ')}`);
    console.log('Run `writbase init` to configure.');
    process.exit(1);
  }

  return partial as Config;
}

export function writeConfig(config: PartialConfig) {
  mkdirSync(WRITBASE_HOME, { recursive: true });
  const jsonPath = join(WRITBASE_HOME, 'config.json');
  const tmpPath = join(WRITBASE_HOME, 'config.json.tmp');

  // Merge with existing config so partial writes don't lose fields
  const existing = loadConfigPartial();
  const merged = { ...existing, ...config };

  const content = JSON.stringify(merged, null, 2) + '\n';
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, jsonPath);
}
