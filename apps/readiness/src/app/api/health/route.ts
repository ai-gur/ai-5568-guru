export const runtime = 'nodejs';

/**
 * Liveness only.
 *
 * Deliberately says nothing about configuration, versions or paths. A health
 * endpoint is the most-probed URL on any service, and every extra field in it
 * is reconnaissance offered for free.
 */
export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
