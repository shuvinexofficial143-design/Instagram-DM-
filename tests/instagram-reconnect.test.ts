import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
process.env.INSTAGRAM_APP_ID = 'test-app';
process.env.INSTAGRAM_APP_SECRET = 'test-secret';
process.env.AUTH_SESSION_SECRET = 'test-state-secret';
const { default: start } = await import('../api/auth/instagram');
const { default: callback } = await import('../api/auth/instagram/callback');
const { createInstagramOAuthState: sign, verifyInstagramOAuthState: verify } = await import('../src/server/instagramOAuthState');
const owner = '12345678-1234-4234-8234-123456789012';
const workspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const target = { ids: ['17841477375204949', '27707792565582295'], username: 'expected_account' };
const secret = 'test-state-secret';
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const json = (body: any, status = 200) => Response.json(body, { status });
function response() {
  return { statusCode: 200, body: null as any, headers: {} as Record<string, any>,
    setHeader(k: string, v: any) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
    send(body: string) { this.body = body; return this; } };
}
function oauthFixture(profile = { id: target.ids[1], user_id: target.ids[0], username: target.username }, storeStatus = 200) {
  const writes: any[] = []; let metaCalls = 0; let subscriptions = 0;
  globalThis.fetch = async (url: any, init?: any) => {
    const value = String(url);
    if (value.includes('/oauth/access_token')) { metaCalls++; return json({ access_token: 'private-short-token', user_id: profile.user_id }); }
    if (value.includes('/access_token?')) { metaCalls++; return json({ access_token: 'private-long-token' }); }
    if (value.includes('/v25.0/me?')) { metaCalls++; return json(profile); }
    if (value.includes('instagram-account-store')) {
      writes.push(JSON.parse(init.body));
      return json(storeStatus === 200 ? { ok: true, workspaceId: workspace } : { ok: false, error: 'This Instagram account is already connected to another login.' }, storeStatus);
    }
    if (value.includes('/subscribed_apps?')) { subscriptions++; return json({ success: true }); }
    throw new Error('Unexpected request in OAuth test');
  };
  return { writes, get metaCalls() { return metaCalls; }, get subscriptions() { return subscriptions; } };
}
const req = (state: string) => ({ method: 'GET', query: { code: 'one-time-code', state }, headers: { host: 'autoreplys.vercel.app' } });

test('reconnect state signs account IDs, username, workspace and owner together', () => {
  const raw = sign(workspace, owner, secret, target);
  assert.deepEqual(verify(raw, secret)?.target, target);
  assert.deepEqual(verify(encodeURIComponent(raw), secret)?.target, target);
  for (const changed of [{ ownerId: workspace }, { workspaceId: owner }, { target: { ...target, ids: ['9999999999'] } }, { target: { ...target, username: 'another' } }, { ts: Date.now() - 20 * 60_000 }, { v: 3 }]) {
    assert.equal(verify(JSON.stringify({ ...JSON.parse(raw), ...changed }), secret), null);
  }
});
test('legacy OAuth states remain valid but unsigned reconnect fields are ignored', () => {
  const ts = Date.now(); const sig = createHmac('sha256', secret).update(`${workspace}:${owner}:${ts}`).digest('hex');
  const state = verify(JSON.stringify({ workspaceId: workspace, ownerId: owner, ts, sig, target }), secret);
  assert.equal(state?.ownerId, owner); assert.equal(state?.target, undefined);
});
test('OAuth start reads the selected disconnected identity through the verified owner RLS session', async () => {
  const queries: URL[] = [];
  globalThis.fetch = async (url: any, init?: any) => {
    const value = String(url); if (value.includes('/auth/')) return json({ id: owner });
    assert.equal(init.headers.Authorization, 'Bearer verified-session'); queries.push(new URL(value));
    return json([{ workspace_id: workspace, ig_user_id: target.ids[0], profile: { username: target.username, ig_scoped_id: target.ids[1], status: 'disconnected' } }]);
  };
  const res = response(); await start({ method: 'GET', query: { intent: 'reconnect' }, headers: { authorization: 'Bearer verified-session', 'x-autoreply-workspace': workspace } }, res);
  assert.equal(res.statusCode, 200); const url = new URL(res.body.url);
  assert.equal(url.searchParams.get('force_reauth'), 'true');
  assert.equal(url.searchParams.get('force_authentication'), null);
  const state = verify(url.searchParams.get('state'), secret);
  assert.equal(state?.workspaceId, workspace); assert.equal(state?.ownerId, owner); assert.deepEqual(state?.target, target);
  assert.ok(queries.every(q => q.searchParams.get('owner_user_id') === `eq.${owner}`));
});
test('a reconnect identity storage outage cannot silently start an unbound login', async () => {
  globalThis.fetch = async (url: any) => String(url).includes('/auth/') ? json({ id: owner }) : json({}, 503);
  const res = response(); await start({ method: 'GET', query: { intent: 'reconnect' }, headers: { authorization: 'Bearer verified-session' } }, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.url, undefined);
});
test('adding a different account requests fresh Instagram login without pinning the current identity', async () => {
  globalThis.fetch = async (url: any) => { assert.ok(String(url).includes('/auth/')); return json({ id: owner }); };
  const res = response(); await start({ method: 'GET', query: { intent: 'add' }, headers: { authorization: 'Bearer verified-session', 'x-autoreply-workspace': workspace } }, res);
  const url = new URL(res.body.url); const state = verify(url.searchParams.get('state'), secret);
  assert.notEqual(state?.workspaceId, workspace); assert.equal(state?.ownerId, owner); assert.equal(state?.target, undefined);
  assert.equal(url.searchParams.get('force_reauth'), 'true');
});
test('correct account reconnect saves to its retained workspace and subscribes before reporting success', async () => {
  const f = oauthFixture(); const res = response(); await callback(req(sign(workspace, owner, secret, target)), res);
  assert.equal(res.statusCode, 200); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].workspaceId, workspace); assert.equal(f.writes[0].ownerId, owner);
  assert.equal(f.writes[0].accessToken, 'private-long-token'); assert.ok(f.subscriptions > 0);
  assert.match(res.headers['Set-Cookie'], new RegExp(`autoreply_active_workspace=${workspace}`));
  assert.match(res.body, /ig_connected/); assert.ok(!res.body.includes('private-long-token'));
});
test('wrong Instagram session explains the selected and returned account without writing any connection', async () => {
  const f = oauthFixture({ id: '28888888888888888', user_id: '17841477777777777', username: 'other_account' });
  const res = response(); await callback(req(sign(workspace, owner, secret, target)), res);
  assert.equal(res.statusCode, 409); assert.equal(f.writes.length, 0); assert.equal(f.subscriptions, 0);
  assert.match(res.body, /reconnecting @expected_account/); assert.match(res.body, /signed in as @other_account/);
  assert.match(res.body, /Back to settings/); assert.match(res.body, /ig_connection_failed/);
  assert.equal(res.headers['Set-Cookie'], undefined);
});
test('Instagram username changes are allowed when the verified numeric identity matches', async () => {
  const f = oauthFixture({ id: target.ids[1], user_id: target.ids[0], username: 'renamed_account' });
  const res = response(); await callback(req(sign(workspace, owner, secret, target)), res);
  assert.equal(res.statusCode, 200); assert.equal(f.writes.length, 1);
});
test('scoped Instagram ID can verify a reconnect without username matching', async () => {
  const f = oauthFixture({ id: target.ids[1], user_id: target.ids[1], username: target.username });
  const res = response(); await callback(req(sign(workspace, owner, secret, target)), res);
  assert.equal(res.statusCode, 200); assert.equal(f.writes.length, 1);
});
test('URI encoded signed state is parsed once and keeps its verified owner on save', async () => {
  const f = oauthFixture(); const res = response(); await callback(req(encodeURIComponent(sign(workspace, owner, secret, target))), res);
  assert.equal(res.statusCode, 200); assert.equal(f.writes[0].ownerId, owner);
});
test('forged reconnect target is rejected before Meta or storage is contacted', async () => {
  const f = oauthFixture(); const parsed = JSON.parse(sign(workspace, owner, secret, target)); parsed.target.ids = ['777777777'];
  const res = response(); await callback(req(JSON.stringify(parsed)), res);
  assert.equal(res.statusCode, 400); assert.equal(f.metaCalls, 0); assert.equal(f.writes.length, 0);
});
test('another website login cannot take an existing Instagram account after disconnect', async () => {
  const f = oauthFixture(undefined, 409); const res = response(); await callback(req(sign(workspace, owner, secret)), res);
  assert.equal(res.statusCode, 409); assert.match(res.body, /Google account originally used/);
  assert.equal(res.headers['Set-Cookie'], undefined); assert.equal(f.subscriptions, 0);
});
test('Meta cancellation is escaped in the page and in popup feedback', async () => {
  const res = response(); await callback({ method: 'GET', query: { error: 'access_denied', error_description: '</script><script>attack()</script>' }, headers: {} }, res);
  assert.ok(!res.body.includes('<script>attack()'));
  assert.match(res.body, /\\u003c\/script>/); assert.match(res.body, /href="\/settings"/);
});
