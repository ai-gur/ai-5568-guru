import { NextRequest } from 'next/server';
import { verifyDomainOwnership } from '@ai5568/scan-policy';
import { currentUser, supabaseServer } from '@/lib/supabase/server';
import { requireEnv } from '@/lib/env';

export const runtime = 'nodejs'; // DNS resolution.

/**
 * Run the ownership proof for one domain.
 *
 * Both outcomes are written back. A failed attempt records what was tried and
 * what it found, because "verification failed" with no detail produces a
 * support ticket rather than a fix — the person cannot tell whether their TXT
 * record has not propagated, their file is behind a redirect, or they pasted
 * the token for a different account.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'נדרשת כניסה.' }, { status: 401 });

  let body: { domain?: unknown };
  try {
    body = (await request.json()) as { domain?: unknown };
  } catch {
    return Response.json({ error: 'גוף הבקשה אינו JSON תקין.' }, { status: 400 });
  }
  if (typeof body.domain !== 'string') {
    return Response.json({ error: 'נדרש שם דומיין.' }, { status: 400 });
  }

  const supabase = await supabaseServer();

  // Read it back through RLS first. Verifying a domain the caller has not
  // claimed would make this endpoint a way to make us fetch arbitrary hosts on
  // request, which is the same shape as the SSRF the scanner guards against.
  const { data: row } = await supabase
    .from('domain_verifications')
    .select('id, domain')
    .eq('domain', body.domain.toLowerCase())
    .maybeSingle();

  if (!row) return Response.json({ error: 'הדומיין אינו רשום בסביבת העבודה שלכם.' }, { status: 404 });

  const outcome = await verifyDomainOwnership(row.domain, user.id, requireEnv('OWNERSHIP_TOKEN_SECRET'));

  await supabase
    .from('domain_verifications')
    .update({
      verified_at: outcome.verified ? new Date().toISOString() : null,
      method: outcome.verified ? (outcome.method === 'dns-txt' ? 'dns_txt' : 'well_known_file') : null,
      last_checked_at: new Date().toISOString(),
      last_error: outcome.verified ? null : outcome.detailHe,
    })
    .eq('id', row.id);

  return Response.json(
    { verified: outcome.verified, method: outcome.method ?? null, detailHe: outcome.detailHe },
    { status: outcome.verified ? 200 : 422 },
  );
}
