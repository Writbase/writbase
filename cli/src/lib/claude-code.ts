import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, cpSync, unlinkSync, chmodSync } from 'node:fs';
import { WRITBASE_HOME } from './config.js';

export function atomicWriteJson(filePath: string, content: string) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}

/** Copy skills + hooks from package to ~/.writbase/ and register as Claude Code plugin. */
export function installSkills(supabaseUrl?: string) {
  const claudeDir = join(homedir(), '.claude');

  mkdirSync(join(WRITBASE_HOME, '.claude-plugin'), { recursive: true });
  mkdirSync(join(WRITBASE_HOME, 'skills'), { recursive: true });

  // Copy skills from package
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const skillsSource = join(packageRoot, 'skills');
  cpSync(skillsSource, join(WRITBASE_HOME, 'skills'), { recursive: true });

  // Copy hooks from package (if present)
  const hooksSource = join(packageRoot, 'hooks');
  if (existsSync(hooksSource)) {
    mkdirSync(join(WRITBASE_HOME, 'hooks'), { recursive: true });
    cpSync(hooksSource, join(WRITBASE_HOME, 'hooks'), { recursive: true });
    const auditHookPath = join(WRITBASE_HOME, 'hooks', 'audit-trail-hook.sh');
    const subagentHookPath = join(WRITBASE_HOME, 'hooks', 'subagent-stop-sync.sh');
    if (existsSync(auditHookPath)) chmodSync(auditHookPath, 0o755);
    if (existsSync(subagentHookPath)) chmodSync(subagentHookPath, 0o755);
  }

  // Write marketplace.json (Claude Code plugin discovery format)
  const marketplaceJson = JSON.stringify(
    {
      name: 'writbase',
      owner: {
        name: 'WritBase',
        email: 'hello@writbase.io',
      },
      metadata: {
        description:
          'WritBase — agent-first task management. Skills for MCP tool usage, permissions, and error handling.',
        version: '0.3.1',
      },
      plugins: [
        {
          name: 'writbase',
          description:
            'WritBase skills for task management, autonomous loops, and session-end extraction.',
          source: './',
          skills: [
            './skills/extract-tasks',
            './skills/loop',
            './skills/writbase-router',
            './skills/writbase-recipes',
          ],
        },
      ],
    },
    null,
    2,
  );
  writeFileSync(join(WRITBASE_HOME, '.claude-plugin', 'marketplace.json'), marketplaceJson);

  // Remove stale plugin.json from pre-0.2.4 installs
  const stalePluginJson = join(WRITBASE_HOME, '.claude-plugin', 'plugin.json');
  if (existsSync(stalePluginJson)) {
    unlinkSync(stalePluginJson);
  }

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
    lastUpdated: new Date().toISOString(),
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

  // Install WritBase Stop hook (agent-type: checks if tasks were tracked)
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const writbaseHookPrompt =
    'Check if WritBase MCP tools are available in this session by looking for ' +
    "'mcp__writbase' in the transcript at $ARGUMENTS. If no WritBase tools were used, " +
    'approve the stop. If WritBase tools were used, check whether work items from this ' +
    'session were tracked: look for mcp__writbase__add_task or mcp__writbase__update_task ' +
    'calls, or /extract-tasks invocation. If tasks were created or updated, approve. ' +
    'If WritBase was used (e.g. info, get_tasks) but no tasks were added/updated and ' +
    "/extract-tasks was not run, block with reason: 'Work was done with WritBase " +
    "connected but no tasks were created or updated. Run /extract-tasks to capture " +
    "untracked items.'";

  // Check if WritBase hook already exists (idempotent)
  const hasWritbaseHook = settings.hooks.Stop.some(
    (entry: { hooks?: Array<{ prompt?: string }> }) =>
      entry.hooks?.some((h: { prompt?: string }) => h.prompt?.includes('mcp__writbase')),
  );

  if (!hasWritbaseHook) {
    settings.hooks.Stop.push({
      hooks: [
        {
          type: 'agent',
          prompt: writbaseHookPrompt,
          timeout: 30,
        },
      ],
    });
  }

  // Install PostToolUse hook (audit-trail: captures git commits + PRs as task provenance)
  const auditHookCmd = join(homedir(), '.writbase', 'hooks', 'audit-trail-hook.sh');
  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }
  const hasAuditHook = settings.hooks.PostToolUse.some(
    (entry: { hooks?: Array<{ command?: string }> }) =>
      entry.hooks?.some((h: { command?: string }) => h.command?.includes('audit-trail-hook')),
  );
  if (!hasAuditHook && existsSync(auditHookCmd)) {
    settings.hooks.PostToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: auditHookCmd }],
    });
  }

  // Install SubagentStop hook (auto-marks tasks done when subagents complete)
  const subagentHookCmd = join(homedir(), '.writbase', 'hooks', 'subagent-stop-sync.sh');
  if (!settings.hooks.SubagentStop) {
    settings.hooks.SubagentStop = [];
  }
  const hasSubagentHook = settings.hooks.SubagentStop.some(
    (entry: { hooks?: Array<{ command?: string }> }) =>
      entry.hooks?.some((h: { command?: string }) => h.command?.includes('subagent-stop-sync')),
  );
  if (!hasSubagentHook && existsSync(subagentHookCmd)) {
    settings.hooks.SubagentStop.push({
      hooks: [{ type: 'command', command: subagentHookCmd }],
    });
  }

  // Set WRITBASE_MCP_URL in global env if supabaseUrl provided
  if (supabaseUrl) {
    if (!settings.env) {
      settings.env = {};
    }
    settings.env.WRITBASE_MCP_URL = supabaseUrl + '/functions/v1/mcp-server/mcp';
  }

  atomicWriteJson(settingsPath, JSON.stringify(settings, null, 2));
}
