import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Completes the emailed-link sign-in by trading the code for a session.
 *
 * `next` is validated as a same-site path before it is used. An open redirect
 * here would let a link that looks like ours drop someone on a page that is
 * not — on the sign-in route, of all places.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requested = url.searchParams.get('next') ?? '/domains';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/domains';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/signin?error=missing-code', url.origin));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/auth/signin?error=invalid-link', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
