import { proofCovers } from '@ai5568/scan-policy';

/**
 * Which domains this deployment will review at all.
 *
 * A temporary, deliberate narrowing while the product is being evaluated. The
 * ownership gate — prove control, then get depth — is the design, and it is
 * built and tested. It is switched off here because there is nothing to gate
 * yet: no accounts, no billing, and one domain.
 *
 * Keeping the restriction as an allowlist rather than simply removing the check
 * matters. An open scanner with no account, no cap and no cost ceiling is
 * something other people find before you have finished evaluating it, and every
 * page it fetches is a request someone else's server has to answer.
 *
 * Empty list means "no restriction", which is why it is never empty here.
 */
const ALLOWED = (process.env.SCAN_ALLOWED_DOMAINS ?? 'aiguru.co.il')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export interface AllowDecision {
  allowed: boolean;
  reasonHe?: string;
}

export function isScannable(rawUrl: string): AllowDecision {
  if (ALLOWED.length === 0) return { allowed: true };

  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return { allowed: false, reasonHe: 'הכתובת אינה תקינה.' };
  }

  // Same matching as a verified proof: exact host or a true subdomain, so
  // `example.co.il.attacker.com` cannot pass by ending with the right letters.
  if (ALLOWED.some((domain) => proofCovers(domain, host))) return { allowed: true };

  return {
    allowed: false,
    reasonHe:
      `בשלב זה המערכת סורקת את ${ALLOWED.join(', ')} בלבד. ` +
      `סריקת אתרים נוספים תיפתח יחד עם אימות הבעלות על הדומיין.`,
  };
}

export const ALLOWED_DOMAINS = ALLOWED;
