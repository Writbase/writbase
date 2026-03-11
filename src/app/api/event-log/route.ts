import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listEvents } from '@/lib/services/event-log';
import { createClient } from '@/lib/supabase/server';
import { parsePagination } from '@/lib/utils/pagination';

const eventLogQuerySchema = z.object({
  targetId: z.uuid().optional(),
  targetType: z.enum(['task', 'agent_key', 'project', 'department']).optional(),
  eventCategory: z.enum(['task', 'admin', 'system']).optional(),
});

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

    const parsed = eventLogQuerySchema.safeParse({
      targetId: searchParams.get('targetId') ?? undefined,
      targetType: searchParams.get('targetType') ?? undefined,
      eventCategory: searchParams.get('eventCategory') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Invalid query parameters',
            details: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const events = await listEvents(supabase, {
      ...parsed.data,
      limit,
      offset,
    });

    return NextResponse.json(
      { data: events },
      {
        headers: { 'Cache-Control': 'private, no-cache' },
      },
    );
  } catch (err) {
    console.error('GET /api/event-log error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
