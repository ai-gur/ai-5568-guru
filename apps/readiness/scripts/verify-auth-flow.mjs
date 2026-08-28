/**
 * End-to-end: a real session, exercising every authenticated path.
 *
 *     npm run web    -w @ai5568/scanner     # port 3569
 *     npm run dev    -w @ai5568/readiness   # port 3568
 *     npm run verify:auth -w @ai5568/readiness
 *
 * It creates a throwaway account and deletes it again. Run it against a
 * development project only — it holds the service role key.
 *
 * The session is minted through Supabase's own verify endpoint rather than by
 * clicking an emailed link, and the cookie is built in the shape @supabase/ssr
 * writes. That covers the signup trigger, RLS, the domains API, verification
 * and review gating.
 *
 * What it does NOT cover is /auth/callback exchanging a PKCE code.
 *
 * `generate_link` always returns an implicit-flow token in the URL fragment,
 * and a fragment is never sent to a server — so no server route can see it. It
 * ignores `code_challenge` too, so the flow cannot be forced. Only a
 * browser-initiated sign-in produces the `?code=` the callback consumes,
 * because the verifier it is checked against lives in a cookie the browser
 * wrote.
 *
 * Note on `redirect_to`: it belongs at the top level of the body. Nested under
 * `options` it is silently ignored and the Site URL is substituted — which
 * reads exactly like a redirect allowlist rejecting the URL, and cost an hour
 * of blaming a correct configuration.
 */
import { readFileSync } from 'node:fs';

/*
 * ⚠️ DO NOT point this at a real domain.
 *
 * It creates throwaway accounts. `generate_link` does not send mail, but a
 * neighbouring call that does — `signInWithOtp`, `POST /auth/v1/otp` — will,
 * and an invented address at a real domain bounces. Enough bounces and the
 * Supabase project is restricted. That happened here.
 *
 * `.invalid` is reserved by RFC 2606 precisely so it can never resolve, so a
 * message to it cannot leave, cannot bounce, and cannot count against anyone.
 */
const TEST_DOMAIN = 'ai5568.invalid';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(U).hostname.split('.')[0];
const APP = 'http://127.0.0.1:3568';
const EMAIL = `e2e-${Date.now()}@${TEST_DOMAIN}`;

const admin = (p, i = {}) => fetch(U + p, { ...i, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...i.headers } });

const g = await admin('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: EMAIL, redirect_to: `${APP}/auth/callback` }) });
const link = await g.json();
console.log('1. account minted   ', EMAIL);

const v = await fetch(`${U}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ type: link.verification_type, email: EMAIL, token: link.email_otp }) });
const session = await v.json();
if (!session.access_token) { console.log('✗ no session:', JSON.stringify(session).slice(0, 200)); process.exit(1); }
console.log('2. session obtained ', session.user.email);

// @supabase/ssr stores the session as base64url JSON behind a `base64-` marker.
const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
const cookie = `sb-${REF}-auth-token=${value}`;
const authed = (p, i = {}) => fetch(APP + p, { ...i, headers: { cookie, ...i.headers } });

const list = await authed('/api/v1/domains');
const listed = await list.json();
console.log('3. GET domains      ', list.status, list.status === 200 ? `${listed.domains.length} rows` : listed.error);
if (list.status !== 200) { console.log('   (cookie shape not accepted — see note in file header)'); }

const add = await authed('/api/v1/domains', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: 'example.co.il' }) });
const added = await add.json();
console.log('4. POST domain      ', add.status, added.token ?? added.error);

const ver = await authed('/api/v1/domains/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: 'example.co.il' }) });
const vr = await ver.json();
console.log('5. verify unowned   ', ver.status, vr.verified === false ? 'correctly refused' : JSON.stringify(vr).slice(0, 120));

const rev = await authed('/api/v1/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.co.il/', maxPages: 200 }) });
const rr = await rev.json();
console.log('6. review unverified', rev.status, 'maxPages =', rr.maxPages ?? rr.error);

// Prove the signup trigger produced exactly one workspace, through RLS.
const rest = await fetch(`${U}/rest/v1/workspaces?select=id,name`, { headers: { apikey: ANON, authorization: `Bearer ${session.access_token}` } });
console.log('7. workspaces (RLS) ', rest.status, JSON.stringify(await rest.json()).slice(0, 120));

const users = await (await admin('/auth/v1/admin/users?per_page=200')).json();
let removed = 0;
for (const u of users.users ?? []) if ((u.email ?? '').endsWith(`@${TEST_DOMAIN}`)) { await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' }); removed++; }
console.log('8. cleaned up       ', removed, 'test accounts');
