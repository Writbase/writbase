import { type NextRequest, NextResponse } from 'next/server';
import { getTaskHistory } from '@/lib/services/tasks';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const history = await getTaskHistory(supabase, id);
    return NextResponse.json(
      { data: history },
      {
        headers: { 'Cache-Control': 'private, no-cache' },
      },
    );
  } catch (err) {
    console.error('GET /api/tasks/[id]/history error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
