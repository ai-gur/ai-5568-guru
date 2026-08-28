import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';

export const runtime = 'nodejs';

/**
 * Completes the emailed-link sign-in by trading the code for a session.
 *
 * `next` is validated as a same-site path before it is used — see
 * lib/safe-redirect.ts, which exists because the obvious check lets `/\evil.com`
 * through. An open redirect here would let a link that looks like ours drop
 * someone somewhere else, on the sign-in route of all places.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

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
