import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('app_settings').select('id').limit(1);

    if (error) {
      return Response.json({ status: 'degraded', db: false }, { status: 503 });
    }

    return Response.json({ status: 'ok', db: true });
  } catch {
    return Response.json({ status: 'error', db: false }, { status: 503 });
  }
}
