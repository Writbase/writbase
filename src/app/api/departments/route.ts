import { NextResponse } from 'next/server';
import { listDepartments } from '@/lib/services/departments';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
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

    const departments = await listDepartments(supabase);
    return NextResponse.json({ data: departments });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      },
      { status: 500 },
    );
  }
}
