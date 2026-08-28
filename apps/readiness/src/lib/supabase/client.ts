'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase.
 *
 * Only ever holds the publishable key. It is safe in the browser because RLS
 * constrains it — not because the key is secret. Nothing here may be given the
 * service role.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
}
