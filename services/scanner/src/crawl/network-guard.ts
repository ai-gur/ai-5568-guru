/**
 * What the scanner is allowed to connect to.
 *
 * A scanner takes a URL from a stranger and fetches it from inside our network.
 * That is the textbook shape of SSRF, and the usual defence — a list of blocked
 * hostnames — does not work, because the attacker controls DNS:
 *
 *     internal.example.com  →  10.0.0.5
 *     metadata.example.com  →  169.254.169.254   (cloud credentials)
 *
 * Neither string looks suspicious. So the check is on the ADDRESSES a name
 * resolves to, never on the name, and every address must pass — a name with one
 * public and one private A record is refused.
 *
 * ⚠️ Known residual: DNS rebinding.
 * We resolve, validate, and then hand the URL to Playwright, which resolves
 * again. A name whose TTL is one second can answer publicly for our check and
 * privately for the browser. Closing that needs connection-level pinning, which
 * Playwright does not expose. It is recorded here rather than left implied,
 * and it is the reason the scanner must run in a container that has nothing
 * worth reaching on its own network.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface GuardResult {
  allowed: boolean;
  /** Hebrew, shown to the requester. */
  reasonHe?: string;
  /** Every address the host resolved to, for the audit trail. */
  addresses?: string[];
}

/** Only these reach the network. `file:`, `ftp:`, `gopher:`, `data:` do not. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

interface Range {
  cidr: string;
  whyHe: string;
}

/**
 * IPv4 ranges that must never be reached. Deliberately wider than "private":
 * benchmarking and documentation ranges are not routable and a request to one
 * is either a mistake or a probe.
 *
 * 169.254.0.0/16 is the one that matters most in practice — it holds the cloud
 * instance metadata endpoint on AWS, GCP and Azure alike.
 */
const V4_BLOCKED: Range[] = [
  { cidr: '0.0.0.0/8', whyHe: 'כתובת "רשת זו"' },
  { cidr: '10.0.0.0/8', whyHe: 'כתובת פרטית' },
  { cidr: '100.64.0.0/10', whyHe: 'כתובת ספק (CGNAT)' },
  { cidr: '127.0.0.0/8', whyHe: 'כתובת מקומית (loopback)' },
  { cidr: '169.254.0.0/16', whyHe: 'כתובת link-local, לרבות נקודת הקצה של מטא-דאטה בענן' },
  { cidr: '172.16.0.0/12', whyHe: 'כתובת פרטית' },
  { cidr: '192.0.0.0/24', whyHe: 'כתובת שמורה לפרוטוקולים' },
  { cidr: '192.0.2.0/24', whyHe: 'כתובת מיועדת לתיעוד' },
  { cidr: '192.88.99.0/24', whyHe: 'כתובת ממסר 6to4' },
  { cidr: '192.168.0.0/16', whyHe: 'כתובת פרטית' },
  { cidr: '198.18.0.0/15', whyHe: 'כתובת מיועדת למדידות ביצועים' },
  { cidr: '198.51.100.0/24', whyHe: 'כתובת מיועדת לתיעוד' },
  { cidr: '203.0.113.0/24', whyHe: 'כתובת מיועדת לתיעוד' },
  { cidr: '224.0.0.0/4', whyHe: 'כתובת multicast' },
  { cidr: '240.0.0.0/4', whyHe: 'כתובת שמורה' },
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

function inV4Range(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const target = v4ToInt(ip);
  const network = v4ToInt(base ?? '');
  if (target === null || network === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (target & mask) === (network & mask);
}

/**
 * IPv6, by prefix. An IPv4-mapped address (`::ffff:10.0.0.5`) is unwrapped and
 * checked as IPv4 — otherwise it is a direct bypass of the whole v4 list.
 */
function checkV6(ip: string): string | null {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return checkV4(mapped[1]);

  if (lower === '::' ) return 'כתובת לא מוגדרת';
  if (lower === '::1') return 'כתובת מקומית (loopback)';
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return 'כתובת link-local';
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return 'כתובת פרטית (unique local)';
  if (/^ff[0-9a-f]{2}:/.test(lower)) return 'כתובת multicast';
  if (lower.startsWith('2001:db8:')) return 'כתובת מיועדת לתיעוד';
  if (lower.startsWith('64:ff9b:')) return 'כתובת תרגום NAT64';
  if (lower.startsWith('100:') && /^100:0*:/.test(lower)) return 'כתובת discard';
  return null;
}

function checkV4(ip: string): string | null {
  for (const range of V4_BLOCKED) {
    if (inV4Range(ip, range.cidr)) return range.whyHe;
  }
  return null;
}

/** Why this address must not be reached, or null if it may be. */
export function blockedReason(address: string): string | null {
  const family = isIP(address);
  if (family === 4) return checkV4(address);
  if (family === 6) return checkV6(address);
  return 'כתובת שאינה תקינה';
}

/**
 * Decide whether the scanner may fetch this URL.
 *
 * Order matters: shape first (cheap, and rejects the obvious), then DNS. A
 * hostname is never trusted on its own, and a literal IP is checked as-is —
 * `http://169.254.169.254/` needs no DNS at all.
 */
export async function guardUrl(raw: string): Promise<GuardResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reasonHe: 'הכתובת אינה תקינה.' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { allowed: false, reasonHe: `ניתן לסרוק כתובות http או https בלבד (התקבל ${url.protocol}).` };
  }

  // Credentials in a URL are almost always an attempt to reach something the
  // requester should not, and we have no business sending them anywhere.
  if (url.username || url.password) {
    return { allowed: false, reasonHe: 'לא ניתן לסרוק כתובת הכוללת שם משתמש או סיסמה.' };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // A bare literal needs no resolution.
  if (isIP(host)) {
    const why = blockedReason(host);
    return why
      ? { allowed: false, reasonHe: `לא ניתן לסרוק ${host} — ${why}.`, addresses: [host] }
      : { allowed: true, addresses: [host] };
  }

  // `.local` is mDNS and never public; refusing it early saves a resolution
  // that would time out anyway.
  if (/\.local$/i.test(host) || host.toLowerCase() === 'localhost') {
    return { allowed: false, reasonHe: `לא ניתן לסרוק ${host} — שם מארח מקומי.` };
  }

  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return { allowed: false, reasonHe: `לא ניתן לפתור את שם המארח ${host}.` };
  }
  if (addresses.length === 0) {
    return { allowed: false, reasonHe: `שם המארח ${host} לא הצביע לאף כתובת.` };
  }

  // EVERY address must pass. A name answering with one public and one private
  // record is a name trying to get somewhere it should not.
  for (const address of addresses) {
    const why = blockedReason(address);
    if (why) {
      return {
        allowed: false,
        reasonHe: `לא ניתן לסרוק ${host} — הוא מצביע אל ${address}, ${why}.`,
        addresses,
      };
    }
  }

  return { allowed: true, addresses };
}
