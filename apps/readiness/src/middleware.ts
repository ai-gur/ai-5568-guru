import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the session fresh.
 *
 * Supabase access tokens are short-lived. Without a refresh on each request a
 * signed-in user is silently signed out mid-task, which on this product means
 * losing a verified domain and dropping back to a shallow review without being
 * told why.
 *
 * `getUser()` rather than `getSession()`: the former revalidates the token with
 * Supabase, the latter reads a cookie the client controls. Only one of those is
 * an authorisation decision.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon. Auth routes are included
    // on purpose — the callback needs to be able to write session cookies.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf)$).*)',
  ],
};
