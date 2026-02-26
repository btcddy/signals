// ══════════════════════════════════════════════════════════════════════════
// Middleware — Protects dashboard routes, refreshes Supabase session
// ══════════════════════════════════════════════════════════════════════════

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  // Protect dashboard routes — redirect to /login if not authenticated
  // Root and setup are protected; login and auth callback are public
  const isPublicRoute = request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth');

  const isProtectedRoute = !isPublicRoute && (
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.startsWith('/setup') ||
    request.nextUrl.pathname.startsWith('/api/holdings') ||
    request.nextUrl.pathname.startsWith('/api/trades') ||
    request.nextUrl.pathname.startsWith('/api/prices') ||
    request.nextUrl.pathname.startsWith('/api/import') ||
    request.nextUrl.pathname.startsWith('/api/platforms') ||
    request.nextUrl.pathname.startsWith('/api/summary')
  );

  // Allow cron endpoint with secret (no session needed)
  const isCronRoute = request.nextUrl.pathname.startsWith('/api/signals/cron');

  if (isProtectedRoute && !user && !isCronRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match dashboard and API routes, skip static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};