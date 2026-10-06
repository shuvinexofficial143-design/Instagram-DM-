import assert from 'node:assert/strict';
import test from 'node:test';
process.env.INSTAGRAM_APP_ID = 'test-app';
process.env.INSTAGRAM_APP_SECRET = 'test-secret';
process.env.GOOGLE_SHEETS_CLIENT_ID = 'test-google-app';
process.env.GOOGLE_SHEETS_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_SHEETS_STATE_SECRET = 'test-state-secret';
const { normalizeAppUrl, normalizeSupabaseUrl, upstreamFetch } = await import('../src/server/supabaseConfig');
const { default: instagram } = await import('../api/auth/instagram');
const { default: sheets } = await import('../api/google-sheets');
const uid = '12345678-1234-4234-8234-123456789012';
const originalFetch = globalThis.fetch;
function response() {
  return { statusCode: 200, body: null as any, headers: {} as Record<string, any>, location: '',
    setHeader(key: string, value: any) { this.headers[key] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
    redirect(code: number, location: string) { this.statusCode = code; this.location = location; return this; } };
}
const request = (action: string, method = 'GET', body: any = {}) => ({ method, query: { action, format: 'json' }, headers: { authorization: 'Bearer test-session', host: 'autoreplys.vercel.app' }, body });
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status });
test.afterEach(() => { globalThis.fetch = originalFetch; });
test('normalizes pasted quotes, whitespace and Supabase service URLs', () => {
  assert.equal(normalizeSupabaseUrl(' "https://example.supabase.co/rest/v1/"\n'), 'https://example.supabase.co');
  assert.throws(() => normalizeSupabaseUrl('https://user:pass@example.com'));
  assert.throws(() => normalizeSupabaseUrl('https://example.com/unexpected'));
});
test('safe reads retry a transient network error', async () => {
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('fetch failed'); return json({ ok: true }); };
  assert.equal((await upstreamFetch('https://example.test')).status, 200);
  assert.equal(calls, 2);
});
test('writes never retry after an ambiguous network failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  await assert.rejects(upstreamFetch('https://example.test', { method: 'POST' }));
  assert.equal(calls, 1);
});
test('Instagram rejects invalid bearer instead of creating guest state', async () => {
  globalThis.fetch = async () => json({}, 401);
  const res = response(); await instagram(request(''), res);
  assert.equal(res.statusCode, 401); assert.equal(res.body.code, 'SESSION_EXPIRED');
  assert.equal(res.headers['Set-Cookie'], undefined);
});
test('Instagram recovers transient auth failure and signs the verified user', async () => {
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('fetch failed'); return json({ id: uid }); };
  const res = response(); await instagram(request(''), res);
  assert.equal(res.statusCode, 200);
  const url = new URL(res.body.url);
  assert.equal(JSON.parse(url.searchParams.get('state')!).workspaceId, uid);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://autoreplys.vercel.app/api/auth/instagram/callback');
});
test('Sheets network failures return actionable JSON with 503', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const res = response(); await sheets(request('connect'), res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'UPSTREAM_UNAVAILABLE');
  assert.match(res.body.error, /Workspace authentication/);
});
test('Sheets connect includes profile scopes and binds state to user', async () => {
  globalThis.fetch = async () => json({ id: uid });
  const res = response(); await sheets(request('connect'), res);
  const url = new URL(res.body.url);
  assert.ok(url.searchParams.get('scope')?.includes('email'));
  const raw = url.searchParams.get('state')!.split('.')[0];
  assert.equal(JSON.parse(Buffer.from(raw, 'base64url').toString()).uid, uid);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
});
test('Sheets status does not silently turn a storage outage into disconnected', async () => {
  globalThis.fetch = async (url: any) => String(url).includes('/auth/') ? json({ id: uid }) : json({}, 500);
  const res = response(); await sheets(request('status'), res);
  assert.equal(res.statusCode, 500); assert.equal(res.body.ok, false);
});
test('Sheets callback cancellation resumes the saved automation with an error', async () => {
  const res = response(); await sheets({ method: 'GET', query: { action: 'callback', error: 'access_denied' }, headers: {} }, res);
  const url = new URL(res.location);
  assert.equal(url.searchParams.get('sheets'), 'error'); assert.equal(url.searchParams.get('resume'), 'ai-sheets');
});
test('Sheets create does not report success when saving its connection fails', async () => {
  globalThis.fetch = async (url: any, init: any) => {
    const value = String(url);
    if (value.includes('/auth/')) return json({ id: uid });
    if (value.includes('/rest/') && init?.method === 'POST') return json({}, 403);
    if (value.includes('/rest/')) return json([{ data: { access_token: 'google-test-token', expires_at: Date.now() + 3600000 } }]);
    if (value.endsWith('/spreadsheets')) return json({ spreadsheetId: 'test-sheet' });
    return json({ updatedRange: 'Leads!A1' });
  };
  const res = response(); await sheets(request('create-sheet', 'POST', { fields: ['Name'] }), res);
  assert.equal(res.statusCode, 500); assert.match(res.body.error, /Could not save/);
});

test('OAuth URLs normalize pasted schemes and reject unsafe configuration', () => {
  assert.equal(normalizeAppUrl(' "autoreplys.vercel.app/" '), 'https://autoreplys.vercel.app');
  assert.equal(normalizeAppUrl('autoreplys.vercel.app/api/auth/instagram/callback'), 'https://autoreplys.vercel.app/api/auth/instagram/callback');
  assert.throws(() => normalizeAppUrl('javascript:alert(1)'));
  assert.throws(() => normalizeAppUrl('https://user:password@example.com'));
});

test('Instagram add-account state keeps login owner separate from the new workspace', async () => {
  globalThis.fetch = async () => json({ id: uid });
  const req:any=request('');req.query.intent='add';const res=response();await instagram(req,res);
  assert.equal(res.statusCode,200);const state=JSON.parse(new URL(res.body.url).searchParams.get('state')!);
  assert.equal(state.ownerId,uid);assert.notEqual(state.workspaceId,uid);
});
test('selected workspace header cannot choose an account belonging to another login', async () => {
  const { authenticatedWorkspace }=await import('../src/server/supabaseConfig');
  globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?json({id:uid}):json([]);
  await assert.rejects(authenticatedWorkspace({headers:{authorization:'Bearer session','x-autoreply-workspace':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}),/does not belong/);
  const stale=await authenticatedWorkspace({headers:{authorization:'Bearer session',cookie:'autoreply_active_workspace=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});
  assert.equal(stale?.id,uid);
});
test('owned Instagram workspace selection keeps the login owner unchanged', async () => {
 const { authenticatedWorkspace }=await import('../src/server/supabaseConfig');const selected='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?json({id:uid}):json([{workspace_id:selected}]);
 assert.deepEqual(await authenticatedWorkspace({headers:{authorization:'Bearer session','x-autoreply-workspace':selected}}),{id:selected,ownerId:uid});
});
test('Sheets connection launched from Integrations returns there when authorization is cancelled',async()=>{
 globalThis.fetch=async()=>json({id:uid});const req:any=request('connect');req.query.returnTo='integrations';const connected=response();await sheets(req,connected);
 assert.equal(connected.statusCode,200);const state=new URL(connected.body.url).searchParams.get('state');
 const callback:any=request('callback');callback.query={action:'callback',error:'access_denied',state};const cancelled=response();await sheets(callback,cancelled);
 assert.ok(cancelled.location.includes('/integrations?sheets=error'));assert.ok(!cancelled.location.includes('resume=ai-sheets'));
});
