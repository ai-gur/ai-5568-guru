/**
 * robots.txt parsing — for politeness and for sitemap discovery.
 *
 * An accessibility audit is run by or for the site owner, so `respectRobots`
 * can be turned off; it defaults on so that pointing the tool at someone else's
 * site behaves.
 */

export interface Robots {
  isAllowed(pathWithQuery: string): boolean;
  sitemaps: string[];
  crawlDelayMs: number | null;
}

const ALLOW_ALL: Robots = { isAllowed: () => true, sitemaps: [], crawlDelayMs: null };

/** Longest-match wins, and on equal length Allow beats Disallow (per the RFC). */
interface Rule {
  allow: boolean;
  pattern: string;
}

function matches(pattern: string, path: string): boolean {
  // robots.txt patterns support `*` (any run) and `$` (end anchor).
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');

  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    if (part === '') continue;
    if (i === 0) {
      if (!path.startsWith(part)) return false;
      idx = part.length;
    } else {
      const found = path.indexOf(part, idx);
      if (found === -1) return false;
      idx = found + part.length;
    }
  }
  if (anchored) {
    const tail = parts[parts.length - 1] ?? '';
    return tail === '' ? true : path.endsWith(tail);
  }
  return true;
}

export function parseRobots(text: string, userAgent: string): Robots {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; crawlDelay: number | null }[] = [];
  const sitemaps: string[] = [];

  let current: (typeof groups)[number] | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;
    if (field === 'allow' && value) current.rules.push({ allow: true, pattern: value });
    else if (field === 'disallow') current.rules.push({ allow: false, pattern: value });
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n * 1000;
    }
  }

  // Most specific matching group: an exact-ish agent match beats the `*` group.
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? wildcard;
  if (!group) return { ...ALLOW_ALL, sitemaps };

  const rules = group.rules;
  return {
    sitemaps,
    crawlDelayMs: group.crawlDelay,
    isAllowed(pathWithQuery: string): boolean {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (rule.pattern === '' && !rule.allow) continue; // "Disallow:" means allow all
        if (!matches(rule.pattern, pathWithQuery)) continue;
        if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}

export async function fetchRobots(origin: string, userAgent: string, timeoutMs: number): Promise<Robots> {
  try {
    const res = await fetch(new URL('/robots.txt', origin), {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return ALLOW_ALL;
    return parseRobots(await res.text(), userAgent);
  } catch {
    // No robots.txt, or unreachable — the permissive reading is the correct one.
    return ALLOW_ALL;
  }
}

/** Pulls page URLs out of a sitemap, following sitemap-index files one level deep. */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  userAgent: string,
  timeoutMs: number,
  depth = 0,
): Promise<string[]> {
  if (depth > 2) return [];
  try {
    const res = await fetch(sitemapUrl, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const xml = await res.text();

    const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) =>
      (m[1] ?? '').replace(/&amp;/g, '&').trim(),
    );

    if (/<sitemapindex/i.test(xml)) {
      const nested = await Promise.all(locs.slice(0, 25).map((u) => fetchSitemapUrls(u, userAgent, timeoutMs, depth + 1)));
      return nested.flat();
    }
    return locs;
  } catch {
    return [];
  }
}
