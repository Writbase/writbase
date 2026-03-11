import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listTasks } from '@/lib/services/tasks';
import { createClient } from '@/lib/supabase/server';
import { parsePagination } from '@/lib/utils/pagination';

const taskQuerySchema = z.object({
  projectId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'due_date', 'priority', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
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

    const parsed = taskQuerySchema.safeParse({
      projectId: searchParams.get('projectId') ?? undefined,
      departmentId: searchParams.get('departmentId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      priority: searchParams.get('priority') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
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

    const tasks = await listTasks(supabase, {
      ...parsed.data,
      limit,
      offset,
    });

    return NextResponse.json(
      { data: tasks },
      {
        headers: { 'Cache-Control': 'private, no-cache' },
      },
    );
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
