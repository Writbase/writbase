import { NextResponse } from 'next/server';
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

    const { data, error } = await supabase
      .from('app_settings')
      .select('department_required')
      .single();

    if (error) throw error;

    return NextResponse.json(
      { data },
      {
        headers: { 'Cache-Control': 'private, max-age=60' },
      },
    );
  } catch (err) {
    console.error('GET /api/settings error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
