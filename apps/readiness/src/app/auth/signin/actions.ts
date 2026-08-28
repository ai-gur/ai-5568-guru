'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

/**
 * Send the sign-in link, on the server.
 *
 * This started as a client handler calling `signInWithOtp` from the browser,
 * and it had a failure mode worth keeping in mind: if the form is submitted
 * before hydration — pressing Enter in the field is enough — the browser does a
 * native GET, and the address lands in the URL:
 *
 *     /auth/signin?email=someone%40example.com
 *
 * Which puts it in browser history, in the Referer header of everything the
 * page then loads, and in the access log of anything in front of us. Nobody
 * typed a password, so nobody thinks of it as a secret, and it quietly becomes
 * one of the few pieces of personal data we handle at all.
 *
 * A server action fixes it at the root rather than papering over the timing:
 * the form posts, so there is no query string to leak, and it works with no
 * JavaScript at all. The PKCE verifier is written as a cookie by the server
 * client, which is also what lets /auth/callback exchange the code later.
 */
export async function sendSignInLink(formData: FormData): Promise<void> {
  /*
   * ⚠️ SENDING IS OFF BY DEFAULT, and this guard is the reason.
   *
   * Supabase's built-in email service is shared infrastructure meant for
   * development, and it judges a project by its bounce rate. Test runs here
   * sent sign-in links to invented addresses at a real domain — they bounced,
   * and the project was threatened with restriction. The addresses were
   * obviously fake to a human and completely ordinary to a mail server.
   *
   * Set AUTH_EMAIL_ENABLED=true to turn it back on, and only once custom SMTP
   * is configured so deliverability is ours to answer for rather than a shared
   * pool's. Never point a test at an address that does not receive mail.
   */
  if (serverEnv('AUTH_EMAIL_ENABLED') !== 'true') {
    redirect('/auth/signin?state=disabled');
  }

  const email = String(formData.get('email') ?? '').trim();

  if (!email || !email.includes('@') || email.length > 254) {
    redirect('/auth/signin?state=invalid');
  }

  // Build the callback from the request's own host so this works on localhost
  // and in production without a second configuration value to keep in step.
  const headerList = await headers();
  const host = headerList.get('host') ?? '127.0.0.1:3568';
  const proto = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');

  const supabase = await supabaseServer();
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback` },
  });

  // The same outcome whether or not the address has an account, and whether or
  // not sending failed. Distinguishing them here would turn this form into a
  // way to find out who is registered.
  redirect('/auth/signin?state=sent');
}
