/**
 * The `next` parameter arrives on a link someone can craft and send to a person
 * about to sign in. Every case here is a way to make a path that reads as ours
 * resolve somewhere else.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeNextPath } from '../src/lib/safe-redirect.ts';

const FALLBACK = '/domains';

describe('post-sign-in redirect', () => {
  it('allows ordinary same-site paths', () => {
    assert.equal(safeNextPath('/domains'), '/domains');
    assert.equal(safeNextPath('/reviews/demo?x=1'), '/reviews/demo?x=1');
    // A dash is ordinary. An earlier character class rejected every path with
    // one, which is the sort of bug that looks like a security rule working.
    assert.equal(safeNextPath('/some-page'), '/some-page');
  });

  it('refuses protocol-relative and absolute URLs', () => {
    for (const bad of ['//evil.com', '////evil.com', 'https://evil.com/x', 'http://evil.com']) {
      assert.equal(safeNextPath(bad), FALLBACK, bad);
    }
  });

  it('refuses the backslash variant', () => {
    // `startsWith('//')` misses this, and enough parsers treat a backslash as a
    // slash that it resolves to another host. This is the case that prompted
    // the module.
    assert.equal(safeNextPath('/' + String.fromCharCode(92) + 'evil.com'), FALLBACK);
    assert.equal(safeNextPath('/' + String.fromCharCode(92) + '/evil.com'), FALLBACK);
  });

  it('refuses the same tricks wearing an encoding', () => {
    for (const bad of ['%2f%2fevil.com', '/%2fevil.com', '%2F%5Cevil.com', '/%5cevil.com']) {
      assert.equal(safeNextPath(bad), FALLBACK, bad);
    }
  });

  it('refuses double-encoded attempts', () => {
    assert.equal(safeNextPath('/%252fevil.com'), FALLBACK);
  });

  it('refuses embedded control characters', () => {
    // Browsers strip tabs and newlines out of a URL before resolving it.
    assert.equal(safeNextPath('/' + String.fromCharCode(9) + 'evil.com'), FALLBACK);
    assert.equal(safeNextPath('/' + String.fromCharCode(10) + 'evil.com'), FALLBACK);
    assert.equal(safeNextPath('/' + String.fromCharCode(13) + 'evil.com'), FALLBACK);
  });

  it('refuses anything carrying a scheme', () => {
    assert.equal(safeNextPath('/javascript:alert(1)'), FALLBACK);
    assert.equal(safeNextPath('javascript:alert(1)'), FALLBACK);
  });

  it('falls back on absent or malformed input', () => {
    assert.equal(safeNextPath(null), FALLBACK);
    assert.equal(safeNextPath(undefined), FALLBACK);
    assert.equal(safeNextPath(''), FALLBACK);
    assert.equal(safeNextPath('%'), FALLBACK);
  });
});
