import { type NextRequest, NextResponse } from 'next/server';
import { listEvents } from '@/lib/services/event-log';
import { createClient } from '@/lib/supabase/server';
import type { EventCategory, TargetType } from '@/lib/types/enums';
import { parsePagination } from '@/lib/utils/pagination';

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(searchParams);

    const events = await listEvents(supabase, {
      targetId: searchParams.get('targetId') || undefined,
      targetType: (searchParams.get('targetType') as TargetType) || undefined,
      eventCategory: (searchParams.get('eventCategory') as EventCategory) || undefined,
      limit,
      offset,
    });

    return NextResponse.json({ data: events });
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
