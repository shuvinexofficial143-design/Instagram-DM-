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
test('Sheets create stops before Google when its durable reservation cannot be saved', async () => {
 let googleCalls=0;
 globalThis.fetch=async(url:any,init:any)=>{const value=String(url);if(value.includes('/auth/'))return json({id:uid});if(value.includes('collection=eq.google_sheets_connections'))return json([{data:{connected:true,access_token:'test',expires_at:Date.now()+3600000}}]);if(value.includes('/rest/')&&init?.method==='POST')return json({},403);if(value.includes('/rest/'))return json([]);googleCalls++;return json({});};
 const res=response();await sheets(request('create-sheet','POST',{automationId:'auto_sheet1',fields:['Name']}),res);
 assert.equal(res.statusCode,500);assert.match(res.body.error,/reserve/);assert.equal(googleCalls,0);
});
test('new AI automations get separate sheets; retry and edit reuse the existing sheet',async()=>{
 const docs=new Map<string,any>();let creates=0;
 globalThis.fetch=async(url:any,init:any)=>{const value=String(url);if(value.includes('/auth/'))return json({id:uid});if(value.includes('collection=eq.google_sheets_connections'))return json([{data:{connected:true,email:'test@example.test',access_token:'test',expires_at:Date.now()+3600000}}]);
 if(value.includes('/rest/')){if(init?.method==='POST'){const body=JSON.parse(init.body);if(!value.includes('on_conflict')&&docs.has(body.id))return json({},409);docs.set(body.id,body.data);return json({});}const id=new URL(value).searchParams.get('id')?.replace('eq.','');return json(id&&docs.has(id)?[{data:docs.get(id)}]:[]);}
 if(value.endsWith('/spreadsheets'))return json({spreadsheetId:'sheet-'+(++creates)});if(value.includes('?fields='))return json({sheets:[{properties:{title:'Conversation history'}}]});return json({});};
 for(const id of ['auto_first','auto_second','auto_first']){const res=response();await sheets(request('create-sheet','POST',{automationId:id,fields:['Name']}),res);assert.equal(res.statusCode,200);assert.equal(res.body.spreadsheetId,id==='auto_first'?'sheet-1':'sheet-2');}
 assert.equal(creates,2);
 const req:any=request('status');req.query.automationId='auto_brand_new';const status=response();await sheets(req,status);assert.equal(status.body.spreadsheetUrl,'');assert.equal(status.body.connected,true);
});
test('ambiguous sheet creation is never blindly repeated',async()=>{
 let creates=0;globalThis.fetch=async(url:any)=>{const value=String(url);if(value.includes('/auth/'))return json({id:uid});if(value.includes('collection=eq.google_sheets_connections'))return json([{data:{connected:true,access_token:'test',expires_at:Date.now()+3600000}}]);if(value.includes('/rest/'))return json([{data:{state:'creating',fields:['Name']}}]);creates++;return json({});};
 const res=response();await sheets(request('create-sheet','POST',{automationId:'auto_pending',fields:['Name']}),res);assert.equal(res.statusCode,409);assert.equal(creates,0);
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

test('runtime Google token refresh rejects browsers and uses the server OAuth configuration',async()=>{
 const bad:any=request('runtime-token','POST',{refreshToken:'private-refresh'});const denied=response();await sheets(bad,denied);assert.equal(denied.statusCode,401);
 let body='';globalThis.fetch=async(url:any,init:any)=>{assert.equal(String(url),'https://oauth2.googleapis.com/token');body=String(init.body);return json({access_token:'short-lived-google'});};
 const good:any=request('runtime-token','POST',{refreshToken:'private-refresh'});good.headers['x-autoreply-oauth-secret']='test-secret';const ok=response();await sheets(good,ok);assert.equal(ok.statusCode,200);assert.equal(ok.body.accessToken,'short-lived-google');assert.ok(body.includes('client_id=test-google-app'));assert.ok(body.includes('refresh_token=private-refresh'));
});
