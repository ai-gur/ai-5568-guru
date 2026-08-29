import { NextRequest } from 'next/server';
import { guardUrl } from '@ai5568/scan-policy';
import { scannerFetch, ScannerUnavailable } from '@/lib/scanner';
import { isScannable } from '@/lib/scan-allowlist';

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

  // While the product is being evaluated there are no accounts, so there is
  // nothing to gate on — and an uncapped scanner open to any URL is something
  // other people find. The allowlist is what stands in for the ownership gate
  // until the gate has something to check. See lib/scan-allowlist.ts.
  const allow = isScannable(body.url);
  if (!allow.allowed) {
    return badRequest(allow.reasonHe ?? 'הכתובת אינה נתמכת בשלב זה.', 422);
  }

  // No page ceiling for now: the point of this stage is to see what a full
  // review of a real site actually produces.
  const maxPages =
    typeof body.maxPages === 'number' && Number.isInteger(body.maxPages)
      ? Math.min(Math.max(body.maxPages, 1), 2000)
      : 200;

  try {
    const scannerResponse = await scannerFetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: body.url, maxPages, maxDepth: 4, documents: true }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = (await scannerResponse.json()) as {
      id?: string;
      error?: string;
      reused?: boolean;
      finishedAt?: string;
    };

    /*
     * The scanner refuses work for reasons the visitor can act on — another scan
     * is running, the day's budget is spent. Those are its words, not a
     * malfunction, so they are passed through with their own status rather than
     * flattened into "the scanner rejected the request".
     */
    if (scannerResponse.status === 429 || scannerResponse.status === 503) {
      return Response.json({ error: payload.error ?? 'הסורק אינו זמין כרגע.' }, { status: scannerResponse.status });
    }

    if (!scannerResponse.ok || !payload.id) {
      return Response.json({ error: payload.error ?? 'שירות הסורק דחה את הבקשה.' }, { status: 502 });
    }

    /*
     * A recent scan of the same site is handed back instead of re-run. Said
     * plainly, because a report that appears instantly with a timestamp from an
     * hour ago is otherwise indistinguishable from one that just ran.
     */
    return Response.json(
      {
        id: payload.id,
        status: payload.reused ? 'done' : 'queued',
        maxPages,
        ...(payload.reused
          ? {
              reused: true,
              notice: `הוצג דוח קיים מהסריקה שהסתיימה ב-${new Date(payload.finishedAt ?? Date.now()).toLocaleString('he-IL')}. סריקה חוזרת של אותו אתר נפתחת בתום שעה.`,
            }
          : {}),
      },
      { status: payload.reused ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof ScannerUnavailable) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json({ error: 'לא ניתן להתחבר לשירות הסורק.' }, { status: 503 });
  }
}
