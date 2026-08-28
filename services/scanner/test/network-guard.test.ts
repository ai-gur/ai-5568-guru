/**
 * The guard is the difference between a scanner and an open proxy into our own
 * network. Every case here is one an attacker actually tries.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockedReason, guardUrl } from '../src/crawl/network-guard.ts';
import { pageLimitFor, verificationToken, SHALLOW_MAX_PAGES } from '../src/ownership.ts';

describe('address ranges', () => {
  it('blocks the cloud metadata endpoint', () => {
    // The single most valuable target of an SSRF: instance credentials on AWS,
    // GCP and Azure all live here.
    assert.ok(blockedReason('169.254.169.254'));
  });

  it('blocks loopback, private and carrier ranges', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1', '100.64.0.1']) {
      assert.ok(blockedReason(ip), `${ip} must be blocked`);
    }
  });

  it('does not over-block: 172.15 and 172.32 are public', () => {
    // The /12 boundary is the classic off-by-one in hand-written range checks.
    assert.equal(blockedReason('172.15.0.1'), null);
    assert.equal(blockedReason('172.32.0.1'), null);
    assert.equal(blockedReason('93.184.216.34'), null);
  });

  it('blocks IPv4-mapped IPv6, which otherwise bypasses the whole v4 list', () => {
    assert.ok(blockedReason('::ffff:127.0.0.1'));
    assert.ok(blockedReason('::ffff:169.254.169.254'));
    assert.equal(blockedReason('::ffff:93.184.216.34'), null);
  });

  it('blocks IPv6 loopback, link-local and unique-local', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1']) {
      assert.ok(blockedReason(ip), `${ip} must be blocked`);
    }
  });

  it('allows a public IPv6 address', () => {
    assert.equal(blockedReason('2606:2800:220:1:248:1893:25c8:1946'), null);
  });
});

describe('guardUrl', () => {
  it('refuses a literal private address without needing DNS', async () => {
    const r = await guardUrl('http://169.254.169.254/latest/meta-data/');
    assert.equal(r.allowed, false);
    assert.match(r.reasonHe ?? '', /link-local/);
  });

  it('refuses anything that is not http or https', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com/']) {
      assert.equal((await guardUrl(url)).allowed, false, `${url} must be refused`);
    }
  });

  it('refuses credentials embedded in the URL', async () => {
    const r = await guardUrl('https://admin:secret@example.com/');
    assert.equal(r.allowed, false);
    assert.match(r.reasonHe ?? '', /שם משתמש/);
  });

  it('refuses localhost and .local without resolving them', async () => {
    assert.equal((await guardUrl('http://localhost:8080/')).allowed, false);
    assert.equal((await guardUrl('http://printer.local/')).allowed, false);
  });

  it('allows an ordinary public address', async () => {
    const r = await guardUrl('https://93.184.216.34/');
    assert.equal(r.allowed, true);
    assert.deepEqual(r.addresses, ['93.184.216.34']);
  });
});

describe('ownership gate', () => {
  it('caps an unverified request, and says that it capped it', () => {
    const { maxPages, cappedHe } = pageLimitFor(false, 200);
    assert.equal(maxPages, SHALLOW_MAX_PAGES);
    // Silently returning five pages of a two-hundred-page site, formatted like
    // a full review, is exactly the dishonesty this product exists to avoid.
    assert.ok(cappedHe, 'the cap must be reported, never applied quietly');
    assert.match(cappedHe, /אינו מתאר את האתר כולו/);
  });

  it('leaves a verified request alone', () => {
    assert.deepEqual(pageLimitFor(true, 200), { maxPages: 200 });
  });

  it('does not cap a request that was already small', () => {
    assert.deepEqual(pageLimitFor(false, 3), { maxPages: 3 });
  });

  it('binds a token to both the domain and the account', () => {
    const a = verificationToken('example.co.il', 'acct-1', 's3cret');
    assert.notEqual(a, verificationToken('other.co.il', 'acct-1', 's3cret'));
    assert.notEqual(a, verificationToken('example.co.il', 'acct-2', 's3cret'));
    assert.notEqual(a, verificationToken('example.co.il', 'acct-1', 'different-secret'));
    assert.equal(a, verificationToken('EXAMPLE.CO.IL', 'acct-1', 's3cret'), 'domain case must not matter');
  });
});
