import { proofCovers } from '@ai5568/scan-policy';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Has this caller proven control of the host they want reviewed?
 *
 * Matching lives in @ai5568/scan-policy, where it is tested — including the
 * case that makes it worth testing, `example.co.il.attacker.com`.
 *
 * Verification also expires. A domain changes hands, and a proof placed once is
 * not a standing licence to crawl that host for ever.
 */

const MAX_AGE_DAYS = 180;

export interface DomainStanding {
  verified: boolean;
  /** Set when a proof exists but has gone stale, so the UI can say which. */
  staleSince?: string;
  matchedDomain?: string;
}

export async function domainStanding(targetUrl: string): Promise<DomainStanding> {
  let host: string;
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return { verified: false };
  }

  const supabase = await supabaseServer();
  // RLS scopes this to the caller's workspaces, so a row belonging to someone
  // else is not merely filtered out here — it is never returned.
  const { data } = await supabase.from('domain_verifications').select('domain, verified_at');
  if (!data) return { verified: false };

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const row of data) {
    if (!proofCovers(row.domain, host)) continue;
    if (!row.verified_at) continue;
    if (new Date(row.verified_at).getTime() >= cutoff) {
      return { verified: true, matchedDomain: row.domain };
    }
    return { verified: false, staleSince: row.verified_at, matchedDomain: row.domain };
  }

  return { verified: false };
}
