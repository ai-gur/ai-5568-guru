/**
 * Who may ask for a deep review.
 *
 * A shallow review — a handful of pages — is open to any public address. That
 * is deliberate: someone should be able to see where their site stands without
 * an account, and an accessibility body should be able to look at a site that
 * is not theirs. It is also the mission: the knowledge is free.
 *
 * A deep review is different. It crawls hundreds of pages, downloads every
 * linked document and spends real money on the judgement layer. Letting a
 * stranger point that at any site is a load problem for the target, a cost
 * problem for us, and — if the target objects — our problem rather than theirs.
 *
 * So depth is gated on proving control of the domain, not on payment. Both
 * proofs are things only someone with real control can place.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { guardUrl } from './network-guard.ts';

/** Pages a review will cover without proof of control. */
export const SHALLOW_MAX_PAGES = 5;

export const WELL_KNOWN_PATH = '/.well-known/ai5568-verify.txt';

export type VerificationMethod = 'dns-txt' | 'well-known-file';

export interface VerificationOutcome {
  verified: boolean;
  method?: VerificationMethod;
  /** Hebrew, shown to the requester — including why a failed attempt failed. */
  detailHe: string;
}

/**
 * The token a domain must publish.
 *
 * Derived rather than stored: an HMAC over domain and account means the same
 * pair always yields the same token, there is no table to keep in sync, and a
 * token for one account proves nothing for another. The secret never leaves
 * the server, so a token cannot be forged from public information.
 */
export function verificationToken(domain: string, accountId: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${domain.toLowerCase()}:${accountId}`)
    .digest('hex')
    .slice(0, 32);
  return `ai5568-verify=${digest}`;
}

/** Constant-time, so a wrong token cannot be discovered one character at a time. */
function tokenMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
  try {
    // A TXT record can be split into chunks; the resolver hands them back as an
    // array that has to be joined before comparing.
    const records = await resolveTxt(domain);
    return records.some((chunks) => tokenMatches(chunks.join(''), token));
  } catch {
    return false;
  }
}

async function checkWellKnownFile(domain: string, token: string): Promise<boolean> {
  const url = `https://${domain}${WELL_KNOWN_PATH}`;

  // The same SSRF guard as any other fetch. Verification is exactly the moment
  // an attacker would try to point us somewhere internal, since it is the one
  // request the product makes to a host of their choosing before any checks.
  const guard = await guardUrl(url);
  if (!guard.allowed) return false;

  try {
    const response = await fetch(url, {
      redirect: 'error', // a redirect could land anywhere; proof must be at the root
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'text/plain' },
    });
    if (!response.ok) return false;

    // Cap the read: a proof file is 45 bytes, and an endpoint that streams
    // forever should not be able to hold the verifier open.
    const body = (await response.text()).slice(0, 1024);
    return body.split(/\r?\n/).some((line) => tokenMatches(line, token));
  } catch {
    return false;
  }
}

/**
 * Try both proofs. DNS first: it survives a site being down or rebuilt, and it
 * cannot be placed by someone who merely got a file onto the web root.
 */
export async function verifyDomainOwnership(
  domain: string,
  accountId: string,
  secret: string,
): Promise<VerificationOutcome> {
  const host = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const token = verificationToken(host, accountId, secret);

  if (await checkDnsTxt(host, token)) {
    return { verified: true, method: 'dns-txt', detailHe: `הבעלות על ${host} אומתה באמצעות רשומת DNS TXT.` };
  }
  if (await checkWellKnownFile(host, token)) {
    return { verified: true, method: 'well-known-file', detailHe: `הבעלות על ${host} אומתה באמצעות הקובץ ${WELL_KNOWN_PATH}.` };
  }

  return {
    verified: false,
    detailHe:
      `לא ניתן היה לאמת בעלות על ${host}. ` +
      `יש להוסיף רשומת DNS TXT בערך "${token}", ` +
      `או להעלות קובץ בכתובת https://${host}${WELL_KNOWN_PATH} שתוכנו "${token}". ` +
      `עד לאימות ניתן להריץ סריקה מצומצמת של עד ${SHALLOW_MAX_PAGES} עמודים.`,
  };
}

/**
 * The page ceiling for a request.
 *
 * Returns the cap rather than throwing, and the caller reports it: a review
 * that quietly covered five pages of a two-hundred-page site, while looking
 * like a full review, is the failure this whole product exists to avoid.
 */
export function pageLimitFor(verified: boolean, requested: number): { maxPages: number; cappedHe?: string } {
  if (verified) return { maxPages: requested };
  if (requested <= SHALLOW_MAX_PAGES) return { maxPages: requested };
  return {
    maxPages: SHALLOW_MAX_PAGES,
    cappedHe:
      `הסריקה הוגבלה ל-${SHALLOW_MAX_PAGES} עמודים משום שהבעלות על הדומיין טרם אומתה. ` +
      `הדוח מתאר את העמודים שנסרקו בלבד ואינו מתאר את האתר כולו.`,
  };
}

/**
 * Does a proof for `verified` cover a request for `host`?
 *
 * Exact match, or a true subdomain: whoever can place a TXT record on
 * example.co.il controls the zone, so shop.example.co.il is covered.
 *
 * The dot is the whole point. `host.endsWith(verified)` on its own would accept
 * `example.co.il.attacker.com` — a domain someone else owns that merely ends
 * with the right characters — and hand them full-depth crawls of any host they
 * can name. Requiring `.` before the verified domain closes that.
 */
export function proofCovers(verified: string, host: string): boolean {
  const v = verified.trim().toLowerCase().replace(/\.$/, '');
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!v || !h) return false;
  return h === v || h.endsWith(`.${v}`);
}
