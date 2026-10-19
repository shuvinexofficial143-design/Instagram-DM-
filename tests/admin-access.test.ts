import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import adminHandler, { configuredAdminEmails, isConfiguredAdmin, adminRelayHeaders } from '../src/server/adminAccess';
import { connectedInstagramAccount } from '../src/lib/instagramConnection';
const uid='12345678-1234-4234-8234-123456789012';
const originalFetch=globalThis.fetch;
const originalAdmins=process.env.ADMIN_EMAILS, originalSecret=process.env.INSTAGRAM_APP_SECRET, originalService=process.env.SUPABASE_SERVICE_ROLE_KEY;
test.beforeEach(()=>{process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';});
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({ADMIN_EMAILS:originalAdmins,INSTAGRAM_APP_SECRET:originalSecret,SUPABASE_SERVICE_ROLE_KEY:originalService})){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
function response(){return {statusCode:200,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;}};}
function request(action='admin-access',method='GET'){return {method,query:{action,email:'owner@example.test'},headers:{authorization:'Bearer session','x-user-email':'owner@example.test'},body:{}};}
const identity=(email='owner@example.test',confirmed=true)=>({id:uid,email,email_confirmed_at:confirmed?'2026-10-01':null});

test('administrator policy is private, normalized, verified and disabled when empty',()=>{
 delete process.env.ADMIN_EMAILS;assert.deepEqual(configuredAdminEmails(),[]);assert.equal(isConfiguredAdmin(identity()),false);
 process.env.ADMIN_EMAILS=' "OWNER@example.test, second@example.test, OWNER@example.test" ';
 assert.deepEqual(configuredAdminEmails(),['owner@example.test','second@example.test']);
 assert.equal(isConfiguredAdmin(identity()),true);assert.equal(isConfiguredAdmin(identity('second@example.test')),true);
 assert.equal(isConfiguredAdmin(identity('other@example.test')),false);assert.equal(isConfiguredAdmin(identity('owner@example.test',false)),false);
 assert.equal(isConfiguredAdmin({...identity(),is_anonymous:true}),false);
});
test('admin access checks the real session and never trusts email parameters or returns the allowlist',async()=>{
 process.env.ADMIN_EMAILS='owner@example.test';globalThis.fetch=async()=>Response.json(identity('other@example.test'));
 const res=response();await adminHandler(request(),res);assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true,isAdmin:false});
 const denied=response();await adminHandler(request('admin-overview'),denied);assert.equal(denied.statusCode,403);
 assert.ok(!JSON.stringify(res.body).includes('owner@example.test'));
});
test('expired login and auth outages fail closed',async()=>{
 globalThis.fetch=async()=>Response.json({}, {status:401});const expired=response();await adminHandler(request(),expired);assert.equal(expired.statusCode,401);assert.equal(expired.body.isAdmin,false);
 globalThis.fetch=async()=>{throw new Error('network unavailable');};const outage=response();await adminHandler(request(),outage);assert.equal(outage.statusCode,503);
});
test('only configured admin receives a signed, action-bound server relay',async()=>{
 process.env.ADMIN_EMAILS='owner@example.test';process.env.INSTAGRAM_APP_SECRET='private-relay-test';let relays=0;
 globalThis.fetch=async(url:any,init:any)=>{
  if(String(url).includes('/auth/'))return Response.json(identity());
  if(String(url).includes('rpc/autoreply_sync_admin_allowlist'))return Response.json(null);
  relays++;assert.equal(JSON.parse(init.body).action,'admin_overview');
  const h=init.headers;assert.equal(h['X-Autoreply-Admin-Signature'],createHmac('sha256','private-relay-test').update(`admin_overview\nsession\n${h['X-Autoreply-Admin-Time']}`).digest('hex'));
  return Response.json({ok:true,profiles:[]});
 };
 const res=response();await adminHandler(request('admin-overview'),res);assert.equal(res.statusCode,200);assert.equal(relays,1);
 delete process.env.INSTAGRAM_APP_SECRET;await adminHandler(request('admin-overview'),response());assert.equal(relays,1);
});
test('admin plan edits require POST and reject unauthorized users before mutations',async()=>{
 process.env.ADMIN_EMAILS='owner@example.test';let writes=0;globalThis.fetch=async(_url:any,init:any)=>{if(init?.method==='POST')writes++;return Response.json(identity('other@example.test'));};
 const wrong=response();await adminHandler(request('admin-update-plan'),wrong);assert.equal(wrong.statusCode,405);
 const denied=response();await adminHandler(request('admin-update-plan','POST'),denied);assert.equal(denied.statusCode,403);assert.equal(writes,0);
});
test('preserved Instagram profiles never masquerade as connected credentials',()=>{
 for(const status of ['disconnected','expired','action_required',undefined])assert.equal(connectedInstagramAccount({username:'shop',status} as any),null);
 const connected=connectedInstagramAccount({username:'shop',status:'connected',access_token:'private'} as any);
 assert.equal(connected?.username,'shop');assert.equal(connected?.access_token,undefined);
});
test('Edge rejects forged, expired, missing and replayed-for-another-action admin relays',async()=>{
 process.env.INSTAGRAM_APP_SECRET='private-relay-test';
 const source=(await readFile(new URL('../supabase/functions/instagram-account-store/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const compiled=await transform(source+'\nglobalThis.verifyRelay=verifyAdminRelay;',{loader:'ts',format:'esm'});
 const context=vm.createContext({crypto:webcrypto,TextEncoder,Date,Uint8Array,Deno:{env:{get:(key:string)=>process.env[key]},serve(){}}});vm.runInContext(compiled.code,context);
 const check=(headers:Record<string,string>,action='admin_overview',token='session')=>context.verifyRelay(new Request('https://example.test',{headers}),action,token);
 assert.equal(await check({}),false);const headers=adminRelayHeaders('admin_overview','session');assert.equal(await check(headers),true);
 assert.equal(await check(headers,'admin_update_plan'),false);assert.equal(await check(headers,'admin_overview','different-session'),false);
 assert.equal(await check({...headers,'X-Autoreply-Admin-Signature':'a'.repeat(64)}),false);
 const timestamp=String(Date.now()-120000),signature=createHmac('sha256','private-relay-test').update(`admin_overview\nsession\n${timestamp}`).digest('hex');
 assert.equal(await check({'X-Autoreply-Admin-Time':timestamp,'X-Autoreply-Admin-Signature':signature}),false);
});
