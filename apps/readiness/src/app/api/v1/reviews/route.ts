import { NextRequest } from 'next/server';
import { guardUrl, pageLimitFor, SHALLOW_MAX_PAGES } from '@ai5568/scan-policy';
import { serverEnv } from '@/lib/env';
import { currentUser } from '@/lib/supabase/server';
import { domainStanding } from '@/lib/verified-domain';

/**
 * POST /api/v1/reviews — request a readiness review.
 *
 * Two refusals happen here, before anything is queued:
 *
 *   1. The network guard. It runs again inside the scanner, and it runs here
 *      too, because a request that never reaches the queue costs nothing and
 *      cannot be retried against a slower path.
 *
 *   2. The depth cap. Without proof of domain control the review is shallow,
 *      and the response says so in the same breath — a caller must not be able
 *      to receive five pages of a two-hundred-page site and reasonably believe
 *      they received a review of the site.
 */

export const runtime = 'nodejs'; // DNS resolution; not available on the edge runtime.

const MAX_URL_LENGTH = 2048;

interface Body {
  url?: unknown;
  maxPages?: unknown;
}

function badRequest(messageHe: string, status = 400): Response {
  return Response.json({ error: messageHe }, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return badRequest('גוף הבקשה אינו JSON תקין.');
  }

  if (typeof body.url !== 'string' || body.url.length === 0 || body.url.length > MAX_URL_LENGTH) {
    return badRequest('נדרשת כתובת אתר תקינה.');
  }

  // Resolved-address check, not a hostname blocklist: internal.example.com and
  // metadata.example.com both look ordinary. See @ai5568/scan-policy.
  const guard = await guardUrl(body.url);
  if (!guard.allowed) {
    return badRequest(guard.reasonHe ?? 'הכתובת נדחתה.', 422);
  }

  // Depth is gated on proof of control, not on payment: a shallow review stays
  // open to anyone, including an accessibility body looking at a site that is
  // not theirs. An anonymous caller is simply never verified, which is the safe
  // direction to be wrong in — it caps depth rather than granting it.
  const user = await currentUser();
  const standing = user ? await domainStanding(body.url) : { verified: false };
  const verified = standing.verified;

  const requested =
    typeof body.maxPages === 'number' && Number.isInteger(body.maxPages)
      ? Math.min(Math.max(body.maxPages, 1), 2000)
      : SHALLOW_MAX_PAGES;

  const { maxPages, cappedHe } = pageLimitFor(verified, requested);

  const scannerUrl = serverEnv('SCANNER_URL');
  if (!scannerUrl) {
    return Response.json({ error: 'שירות הסורק טרם הוגדר.' }, { status: 503 });
  }

  try {
    const scannerResponse = await fetch(new URL('/api/scan', scannerUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(serverEnv('SCANNER_TOKEN') ? { authorization: `Bearer ${serverEnv('SCANNER_TOKEN')}` } : {}),
      },
      body: JSON.stringify({ url: body.url, maxPages, maxDepth: 3, documents: true }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const payload = (await scannerResponse.json()) as { id?: string; error?: string };
    if (!scannerResponse.ok || !payload.id) {
      return Response.json({ error: payload.error ?? 'שירות הסורק דחה את הבקשה.' }, { status: 502 });
    }

    return Response.json(
      {
        id: payload.id,
        status: 'queued',
        maxPages,
        verifiedDomain: standing.matchedDomain ?? null,
        // Present whenever the request was trimmed. The client is expected to
        // show it; the API states it either way so it cannot be lost silently.
        ...(cappedHe ? { notice: cappedHe } : {}),
        // A proof that has aged out is a different situation from never having
        // had one, and the person can fix it in one click if we say so.
        ...(standing.staleSince
          ? {
              notice:
                `${cappedHe ?? ''} אימות הבעלות על ${standing.matchedDomain} פג. ` +
                'הריצו אימות מחדש בעמוד הדומיינים כדי לחזור לסריקה מלאה.'.trim(),
            }
          : {}),
      },
      { status: 202 },
    );
  } catch {
    return Response.json({ error: 'לא ניתן להתחבר לשירות הסורק.' }, { status: 503 });
  }
}
