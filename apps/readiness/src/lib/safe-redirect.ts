/**
 * Where a post-sign-in redirect is allowed to go.
 *
 * The `next` parameter arrives on a URL someone can craft and send to a person
 * who is about to authenticate. If it can point off-site, the sign-in page
 * becomes a way to launder a link: it looks like ours right up until it is not.
 *
 * The obvious check — starts with `/`, does not start with `//` — is not
 * enough. `/\evil.com` passes it, and enough URL parsers treat a backslash as a
 * slash that it resolves to a different host. `/%2fevil.com` is the same trick
 * wearing an encoding. So the rule is stated positively instead: one slash,
 * then a character that is neither a slash nor a backslash.
 */

const FALLBACK = '/domains';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;

  // Decode first, or `%2f%2fevil.com` slips past a check on the raw string and
  // becomes `//evil.com` the moment anything resolves it. Repeated, because
  // double-encoding is the obvious next move.
  let candidate = raw;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      return FALLBACK; // malformed encoding is not a path worth following
    }
  }

  // Control characters and space — including the tab and newline that browsers
  // strip out of a URL before resolving it, so `/<tab>evil.com` is not the
  // string it appears to be.
  //
  // Written as explicit code points on purpose. An earlier version was a
  // hand-typed character range that collapsed to "space or hyphen": it rejected
  // every path containing a dash while catching none of what it was for. A
  // character class is exactly where a typo still looks like a rule.
  for (const character of candidate) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return FALLBACK;
  }

  // Backslashes are never legitimate in a path we generate, and are the whole
  // point of this module. Reject them anywhere, not only in second position.
  if (candidate.includes('\\')) return FALLBACK;

  // One slash, then something that is not another slash.
  if (!/^\/(?!\/)/.test(candidate)) return FALLBACK;

  // A scheme cannot appear in a path-only redirect.
  if (candidate.includes(':')) return FALLBACK;

  return candidate;
}
