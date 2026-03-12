import { NextResponse } from 'next/server';
import { listAgentKeys, updateAgentKey } from '@/lib/services/agent-keys';
import { getWorkspaceForUser } from '@/lib/services/workspace';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const keys = await listAgentKeys(supabase);
    const key = keys.find((k) => k.id === id);

    if (!key) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Agent key not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: key }, { headers: { 'Cache-Control': 'private, no-cache' } });
  } catch (err) {
    console.error('GET /api/agent-keys/[id] error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const body = (await req.json()) as {
      name?: string;
      specialPrompt?: string | null;
      isActive?: boolean;
    };

    const workspace = await getWorkspaceForUser(supabase);
    const updated = await updateAgentKey(supabase, {
      id,
      name: body.name,
      specialPrompt: body.specialPrompt,
      isActive: body.isActive,
      actorId: user.id,
      workspaceId: workspace.id,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('PATCH /api/agent-keys/[id] error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
