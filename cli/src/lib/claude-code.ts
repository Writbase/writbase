import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, cpSync } from 'node:fs';
import { WRITBASE_HOME } from './config.js';

function atomicWriteJson(filePath: string, content: string) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}

/** Copy skills from package to ~/.writbase/skills/ and register as Claude Code plugin. */
export function installSkills() {
  const claudeDir = join(homedir(), '.claude');

  mkdirSync(join(WRITBASE_HOME, '.claude-plugin'), { recursive: true });
  mkdirSync(join(WRITBASE_HOME, 'skills'), { recursive: true });

  // Copy skills from package
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const skillsSource = join(packageRoot, 'skills');
  cpSync(skillsSource, join(WRITBASE_HOME, 'skills'), { recursive: true });

  // Write plugin.json
  const pluginJson = JSON.stringify(
    {
      name: 'writbase',
      description:
        'WritBase — agent-first task management. Skills for MCP tool usage, permissions, and error handling.',
      version: '0.2.3',
    },
    null,
    2,
  );
  writeFileSync(join(WRITBASE_HOME, '.claude-plugin', 'plugin.json'), pluginJson);

  // Register in Claude's known_marketplaces.json
  const pluginsDir = join(claudeDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });

  const marketplacesPath = join(pluginsDir, 'known_marketplaces.json');
  const marketplaces = existsSync(marketplacesPath)
    ? JSON.parse(readFileSync(marketplacesPath, 'utf-8'))
    : {};

  marketplaces['writbase'] = {
    source: { source: 'directory', path: WRITBASE_HOME },
    installLocation: WRITBASE_HOME,
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
