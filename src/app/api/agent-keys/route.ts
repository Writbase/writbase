import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listAgentKeys } from '@/lib/services/agent-keys';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, { status: 401 });
    }

    const keys = await listAgentKeys(supabase);
    return NextResponse.json({ data: keys });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    );
  }
}
