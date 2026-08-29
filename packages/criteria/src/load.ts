/**
 * Catalogue loading.
 *
 * The catalogue lives in this package, so this package reads it. A consumer
 * that had to know the file path would be a consumer that breaks when the
 * layout changes — and there are four of them.
 *
 * Imported as a module rather than read from disk. Two of those consumers now
 * run where there is no filesystem — the Readiness app is a Cloudflare Worker —
 * and `readFile` there fails at request time with a 500, after a scan has
 * already been paid for. A static import is inlined by every bundler and read
 * natively by Node, so both runtimes get the same catalogue by the same path,
 * and a missing file fails the build instead of the request.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import catalogue from '../data/criteria.json' with { type: 'json' };
import type { Catalogue } from './schema.ts';

/**
 * Where the catalogue is written, for the importer that generates it.
 *
 * A path, not a read: nothing on the request path touches it, so it costs a
 * bundled runtime nothing. Reading through it was the bug.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_PATH = resolve(HERE, '../data/criteria.json');

/**
 * Async by contract, not by need. It was async when it read from disk, all four
 * consumers await it, and a signature change would be churn for nothing.
 */
export async function loadCatalogue(): Promise<Catalogue> {
  return catalogue as unknown as Catalogue;
}

/** The catalogue as a value, for callers that are already synchronous. */
export const CATALOGUE = catalogue as unknown as Catalogue;
