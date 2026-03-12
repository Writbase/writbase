import { NextResponse } from 'next/server';
import { rotateAgentKey } from '@/lib/services/agent-keys';
import { getWorkspaceForUser } from '@/lib/services/workspace';
import { createClient } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Unauthorized' } },
        { status: 401 },
      );
    }

    const { id } = await params;
    const workspace = await getWorkspaceForUser(supabase);
    const { key, fullKey } = await rotateAgentKey(supabase, {
      id,
      actorId: user.id,
      workspaceId: workspace.id,
    });

    return NextResponse.json({ data: { key, fullKey } });
  } catch (err) {
    console.error('POST /api/agent-keys/[id]/rotate error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
