import type { SupabaseClient } from '@supabase/supabase-js';
import type { Workspace } from '@/lib/types/database';

export async function getWorkspaceForUser(supabase: SupabaseClient): Promise<Workspace> {
  const { data, error } = (await supabase.from('workspaces').select('*').limit(1).single()) as {
    data: Workspace | null;
    error: Error | null;
  };

  if (error || !data) {
    // Fallback: try to provision via RPC
    const { data: wsId, error: rpcError } = (await supabase.rpc('ensure_user_workspace')) as {
      data: string | null;
      error: Error | null;
    };
    if (rpcError || !wsId) {
      throw new Error('No workspace found and provisioning failed');
    }

    const { data: ws, error: fetchError } = (await supabase
      .from('workspaces')
      .select('*')
      .eq('id', wsId)
      .single()) as { data: Workspace | null; error: Error | null };

    if (fetchError || !ws) {
      throw new Error('Workspace provisioned but fetch failed');
    }

    return ws;
  }

  return data;
}
