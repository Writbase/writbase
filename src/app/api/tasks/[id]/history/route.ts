import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTaskHistory } from '@/lib/services/tasks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, { status: 401 });
    }

    const { id } = await params;
    const history = await getTaskHistory(supabase, id);
    return NextResponse.json({ data: history });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'internal_error', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    );
  }
}
