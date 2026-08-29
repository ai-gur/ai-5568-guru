import { serverEnv } from '@/lib/env';

/**
 * The one way this app talks to the scanner.
 *
 * In production the scanner is a Worker with no route of its own, reached over
 * a service binding. That is deliberate: the scanner spends real money per
 * request, and a service binding means it has no address on the internet at all
 * rather than an address guarded by a shared secret.
 *
 * In development it is an ordinary process on localhost. Both are the same call
 * here, so no route has to know which one it is talking to.
 */

interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * Bindings are attached to the request context on Workers, not to `process.env`.
 * Read lazily and defensively — this module is also imported during `next build`,
 * where no binding exists.
 */
async function binding(): Promise<ServiceBinding | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const env = getCloudflareContext().env as unknown as Record<string, ServiceBinding | undefined>;
    return env.SCANNER ?? null;
  } catch {
    return null;
  }
}

export class ScannerUnavailable extends Error {}

/**
 * @param path  Absolute path on the scanner, e.g. `/api/jobs/abc`.
 * @throws ScannerUnavailable when neither a binding nor a URL is configured.
 */
export async function scannerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = serverEnv('SCANNER_TOKEN');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const service = await binding();
  if (service) {
    // The hostname is ignored by a service binding, but a Request still needs a
    // valid absolute URL to exist.
    return service.fetch(new Request(new URL(path, 'https://scanner.internal'), { ...init, headers }));
  }

  const base = serverEnv('SCANNER_URL');
  if (!base) throw new ScannerUnavailable('שירות הסורק טרם הוגדר.');

  return fetch(new URL(path, base), {
    ...init,
    headers,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
}
