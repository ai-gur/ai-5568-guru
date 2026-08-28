import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

/**
 * Server-side Supabase, bound to the caller's session cookies.
 *
 * Uses the publishable key, not the service role, so every query is still
 * subject to Row Level Security. That is the point: the policies are the
 * security boundary, and code that routinely bypasses them turns them into
 * decoration nobody notices has stopped working.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    serverEnv('NEXT_PUBLIC_SUPABASE_URL') ?? '',
    serverEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. Never throws — callers decide what to do. */
export async function currentUser() {
  const supabase = await supabaseServer();
  // getUser() revalidates the token with Supabase. getSession() would read it
  // straight from a cookie the client controls, which is not an authorisation
  // decision anyone should make.
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
