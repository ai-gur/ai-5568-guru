import { NextRequest } from 'next/server';
import { scannerFetch } from '@/lib/scanner';

export const runtime = 'nodejs';

/**
 * Live status of a running review.
 *
 * Polled by the progress screen. Proxied rather than exposed directly because
 * the scanner sits on a private network and holds the AI provider key — nothing
 * in a browser should be able to address it.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]{6,64}$/.test(id)) {
    return Response.json({ error: 'מזהה סריקה אינו תקין.' }, { status: 400 });
  }



  try {
    const response = await scannerFetch(`/api/jobs/${id}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return Response.json({ error: 'הסריקה לא נמצאה.' }, { status: 404 });
    return Response.json(await response.json(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'לא ניתן להתחבר לשירות הסורק.' }, { status: 503 });
  }
}
