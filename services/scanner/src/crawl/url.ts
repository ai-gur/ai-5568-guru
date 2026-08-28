/**
 * URL canonicalisation and scoping.
 *
 * Without this, a single Israeli news or e-commerce site produces hundreds of
 * "pages" that are one page wearing different query strings, and the report
 * becomes noise. Everything here is about deciding when two URLs are the same
 * document.
 */

/** Query parameters that never change what the page shows. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^_ga$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^dclid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^ref$/i,
  /^referrer$/i,
  /^source$/i,
  /^campaign/i,
  /^yclid$/i,
  /^_openstat$/i,
];

/** Extensions we treat as documents (IS 5568 Part 2) rather than pages. */
export const DOCUMENT_EXTENSIONS: Record<string, 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt'> = {
  '.pdf': 'pdf',
  '.doc': 'docx',
  '.docx': 'docx',
  '.docm': 'docx',
  '.rtf': 'docx',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.ppsx': 'pptx',
  '.xls': 'xlsx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.csv': 'txt',
  '.txt': 'txt',
};

/** Binary or media files that are neither pages nor Part 2 documents. */
const IGNORED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp', '.tiff',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov', '.m4a', '.m4v',
  '.zip', '.rar', '.7z', '.gz', '.tar', '.exe', '.dmg', '.msi', '.apk',
  '.css', '.js', '.mjs', '.map', '.json', '.xml', '.rss', '.atom',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
]);

export function extensionOf(pathname: string): string {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot === -1 ? '' : last.slice(dot).toLowerCase();
}

/**
 * Registrable domain, approximately. A full public-suffix list would be more
 * correct, but the two-label heuristic plus the known Israeli multi-label
 * suffixes covers the sites this tool is pointed at.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'muni.il', 'k12.il', 'idf.il',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.nz', 'com.br',
]);

export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

export function sameSite(a: URL, b: URL): boolean {
  return registrableDomain(a.hostname) === registrableDomain(b.hostname);
}

/**
 * Produces the key under which a URL is deduplicated.
 *
 * Deliberately *not* dropping every query string: on a large share of Israeli
 * municipal and government sites the page identity lives entirely in the query
 * (`?page=services&id=42`), so stripping it would collapse the whole site into
 * one row. Only known-tracking parameters go.
 */
export function canonicalize(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  u.hash = '';
  u.hostname = u.hostname.toLowerCase();

  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
    u.port = '';
  }

  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.some((re) => re.test(k)));
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);

  // Collapse "/path/" and "/path" — but never touch the root, where the slash matters.
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  // "/index.html" and "/" are the same document on essentially every server.
  u.pathname = u.pathname.replace(/\/(index|default)\.(html?|php|aspx?)$/i, '/');
  if (u.pathname === '') u.pathname = '/';

  return u.toString();
}

export type LinkKind = 'page' | 'document' | 'ignore';

export function classifyLink(url: string): { kind: LinkKind; docType?: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt' } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'ignore' };
  }
  const ext = extensionOf(u.pathname);
  const docType = DOCUMENT_EXTENSIONS[ext];
  if (docType) return { kind: 'document', docType };
  if (IGNORED_EXTENSIONS.has(ext)) return { kind: 'ignore' };
  return { kind: 'page' };
}

export function inScope(url: string, start: URL, include?: RegExp[], exclude?: RegExp[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (exclude?.some((re) => re.test(url))) return false;
  if (include?.length) return include.some((re) => re.test(url));
  return sameSite(u, start);
}

/** Filesystem-safe slug for naming per-page report files. */
export function slugForUrl(url: string): string {
  const u = new URL(url);
  const path = (u.pathname + u.search)
    .replace(/[^\p{L}\p{N}\-_/]+/gu, '-')
    .replace(/\/+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = path || 'home';
  return slug.length > 80 ? slug.slice(0, 80) : slug;
}
