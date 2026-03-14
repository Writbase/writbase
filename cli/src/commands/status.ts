import { createSpinner } from 'nanospinner';
import { loadConfig } from '../lib/config.js';
import { createAdminClient } from '../lib/supabase.js';
import { success, error, info, table } from '../lib/output.js';

export async function statusCommand() {
  const config = loadConfig();
  const supabase = createAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const spinner = createSpinner('Checking connection...').start();

  try {
    // DB connection check
    const { error: connError } = await supabase
      .from('app_settings')
      .select('*')
      .limit(1);

    if (connError) {
      spinner.error({ text: 'Connection failed' });
      error(connError.message);
      process.exit(1);
    }

    spinner.success({ text: 'Connected to Supabase' });

    // Counts
    const wsId = config.workspaceId;

    const [workspaces, keys, tasks, projects] = await Promise.all([
      supabase
        .from('workspaces')
        .select('*', { count: 'exact', head: true })
        .eq('id', wsId),
      supabase
        .from('agent_keys')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId),
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId),
      supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId),
    ]);

    console.log();
    info(`Workspace: ${wsId}`);
    console.log();

    table(
      ['Resource', 'Count'],
      [
        ['Workspaces', String(workspaces.count ?? 0)],
        ['Agent Keys', String(keys.count ?? 0)],
        ['Tasks', String(tasks.count ?? 0)],
        ['Projects', String(projects.count ?? 0)],
      ],
    );

    console.log();
    success('WritBase is healthy');
  } catch (err) {
    spinner.error({ text: 'Health check failed' });
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
