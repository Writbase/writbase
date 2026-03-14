import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
