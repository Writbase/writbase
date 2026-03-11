import { type NextRequest, NextResponse } from 'next/server';
import { listTasks } from '@/lib/services/tasks';
import { createClient } from '@/lib/supabase/server';
import type { Priority, Status } from '@/lib/types/enums';
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

    const tasks = await listTasks(supabase, {
      projectId: searchParams.get('projectId') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      status: (searchParams.get('status') as Status) || undefined,
      priority: (searchParams.get('priority') as Priority) || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
      limit,
      offset,
    });

    return NextResponse.json({ data: tasks });
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
