import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Use getUser() NOT getSession() — getSession() only reads cookies and can be spoofed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to /login for dashboard routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/api') &&
    !request.nextUrl.pathname.startsWith('/_next')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Per-user rate limiting (120 requests/minute)
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- supabase.rpc returns untyped data
    const { data: rateLimitCount } = await supabase.rpc('increment_user_rate_limit', {
      p_user_id: user.id,
    });
    const count = rateLimitCount as number | null;
    if (typeof count === 'number' && count > 120) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  // Generate CSP nonce and set header for layout to read
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  supabaseResponse.headers.set('x-nonce', nonce);

  // Set nonce-based CSP (script-src uses nonce, style-src keeps unsafe-inline for Sonner)
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
  ].join('; ');

  supabaseResponse.headers.set('Content-Security-Policy', csp);

  return supabaseResponse;
}
