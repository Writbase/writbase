import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, cpSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole } from './types.js';
import { logEvent } from './event-log.js';
import { WRITBASE_HOME } from './config.js';

export function generatePluginJson(): string {
  return JSON.stringify(
    {
      name: 'writbase',
      description:
        'WritBase — agent-first task management. Skills for MCP tool usage, permissions, and error handling.',
      version: '0.1.1',
    },
    null,
    2,
  );
}

export function generateMcpJson(mcpUrl: string, agentKey: string): string {
  return JSON.stringify(
    {
      writbase: {
        type: 'http',
        url: mcpUrl,
        headers: {
          Authorization: `Bearer ${agentKey}`,
        },
      },
    },
    null,
    2,
  );
}

function atomicWriteJson(filePath: string, content: string) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}

export function installPlugin(config: { mcpUrl: string; agentKey: string }) {
  const claudeDir = join(homedir(), '.claude');

  mkdirSync(join(WRITBASE_HOME, '.claude-plugin'), { recursive: true });
  mkdirSync(join(WRITBASE_HOME, 'skills'), { recursive: true });

  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const skillsSource = join(packageRoot, 'skills');
  cpSync(skillsSource, join(WRITBASE_HOME, 'skills'), { recursive: true });

  writeFileSync(join(WRITBASE_HOME, '.claude-plugin', 'plugin.json'), generatePluginJson());

  const mcpContent = generateMcpJson(config.mcpUrl, config.agentKey);
  const mcpPath = join(WRITBASE_HOME, '.mcp.json');
  const mcpTmpPath = join(WRITBASE_HOME, '.mcp.json.tmp');
  writeFileSync(mcpTmpPath, mcpContent, { mode: 0o600 });
  renameSync(mcpTmpPath, mcpPath);

  // Register in Claude's known_marketplaces.json
  const pluginsDir = join(claudeDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });

  const marketplacesPath = join(pluginsDir, 'known_marketplaces.json');
  const marketplaces = existsSync(marketplacesPath)
    ? JSON.parse(readFileSync(marketplacesPath, 'utf-8'))
    : {};

  marketplaces['writbase'] = {
    source: { source: 'directory', path: WRITBASE_HOME },
    autoUpdate: false,
  };

  atomicWriteJson(marketplacesPath, JSON.stringify(marketplaces, null, 2));

  // Enable in Claude's settings.json
  const settingsPath = join(claudeDir, 'settings.json');
  const settings = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
    : {};

  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }
  settings.enabledPlugins['writbase@writbase'] = true;

  atomicWriteJson(settingsPath, JSON.stringify(settings, null, 2));
}

export async function grantBasicPermissions(
  supabase: SupabaseClient,
  params: {
    keyId: string;
    projectId: string;
    workspaceId: string;
    role: AgentRole;
  },
) {
  const perms: Record<string, unknown> = {
    agent_key_id: params.keyId,
    project_id: params.projectId,
    workspace_id: params.workspaceId,
    can_read: true,
    can_create: true,
    can_update: true,
    can_assign: params.role === 'manager',
  };

  const { error } = await supabase.from('agent_permissions').insert(perms);

  if (error) throw error;

  await logEvent(supabase, {
    eventCategory: 'admin',
    targetType: 'agent_key',
    targetId: params.keyId,
    eventType: 'agent_permission.granted',
    actorType: 'system',
    actorId: 'writbase-cli',
    actorLabel: 'writbase-cli',
    source: 'system',
    workspaceId: params.workspaceId,
  });
}
