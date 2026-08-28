import { NextRequest } from 'next/server';
import { verificationToken } from '@ai5568/scan-policy';
import { currentUser, supabaseServer } from '@/lib/supabase/server';
import { requireEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Domains a workspace claims, and the proof each one still needs.
 *
 * The token is derived, never stored: the same domain and account always
 * produce the same value, so there is no table to keep in sync and no way for
 * a token issued to one account to prove anything for another.
 */

/** A hostname, not a URL — and never something that could carry a path. */
function normaliseDomain(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > 253) return null;
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.startsWith('-')) return null;
  return host;
}

async function workspaceId(): Promise<string | null> {
  const supabase = await supabaseServer();
  // RLS limits this to workspaces the caller belongs to, so there is no filter
  // on user id here — adding one would imply the policy might not hold.
  const { data } = await supabase.from('workspaces').select('id').limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'נדרשת כניסה.' }, { status: 401 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('domain_verifications')
    .select('id, domain, verified_at, method, last_checked_at, last_error')
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: 'לא ניתן לטעון את רשימת הדומיינים.' }, { status: 500 });

  const secret = requireEnv('OWNERSHIP_TOKEN_SECRET');
  return Response.json({
    domains: (data ?? []).map((row) => ({
      ...row,
      token: verificationToken(row.domain, user.id, secret),
    })),
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'נדרשת כניסה.' }, { status: 401 });

  let body: { domain?: unknown };
  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return Response.json({ error: 'גוף הבקשה אינו JSON תקין.' }, { status: 400 });
  }

  const domain = normaliseDomain(body.domain);
  if (!domain) return Response.json({ error: 'נדרש שם דומיין תקין, למשל example.co.il' }, { status: 400 });

  const workspace = await workspaceId();
  if (!workspace) return Response.json({ error: 'לא נמצאה סביבת עבודה לחשבון.' }, { status: 409 });

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('domain_verifications')
    .upsert({ workspace_id: workspace, domain }, { onConflict: 'workspace_id,domain' });

  if (error) return Response.json({ error: 'לא ניתן היה להוסיף את הדומיין.' }, { status: 500 });

  return Response.json(
    {
      domain,
      token: verificationToken(domain, user.id, requireEnv('OWNERSHIP_TOKEN_SECRET')),
      instructionsHe:
        'הוסיפו רשומת DNS מסוג TXT בערך שלמעלה, או העלו קובץ בכתובת ' +
        `https://${domain}/.well-known/ai5568-verify.txt שתוכנו הוא אותו ערך. ` +
        'לאחר מכן לחצו על "אימות".',
    },
    { status: 201 },
  );
}
