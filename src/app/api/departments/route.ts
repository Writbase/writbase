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
    return NextResponse.json(
      { data: departments },
      {
        headers: { 'Cache-Control': 'private, max-age=30' },
      },
    );
  } catch (err) {
    console.error('GET /api/departments error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
