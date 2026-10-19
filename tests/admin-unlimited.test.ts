import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { synchronizeAdminPolicy } from '../src/server/adminPolicy';
import { getFallbackWorkspaceUsage } from '../src/lib/planUsage';
const originalFetch=globalThis.fetch, originalEnv={...process.env};
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);});
test('administrator entitlement policy sends only normalized hashes with server credentials',async()=>{
 process.env.ADMIN_EMAILS=' "UNLIMITED@example.test, unlimited@example.test" ';process.env.SUPABASE_SERVICE_ROLE_KEY='private-service-key';let calls=0;
 globalThis.fetch=async(url:any,init:any)=>{calls++;assert.ok(String(url).endsWith('/rpc/autoreply_sync_admin_allowlist'));assert.equal(init.headers.apikey,'private-service-key');assert.equal(init.headers.Authorization,'Bearer private-service-key');assert.deepEqual(JSON.parse(init.body),{p_email_hashes:[createHash('sha256').update('unlimited@example.test').digest('hex')]});assert.ok(!init.body.includes('@'));return Response.json(null);};
 await Promise.all([synchronizeAdminPolicy(),synchronizeAdminPolicy()]);await synchronizeAdminPolicy();assert.equal(calls,1);
});
test('removing the administrator environment allowlist revokes the mirrored policy',async()=>{
 process.env.ADMIN_EMAILS='';process.env.SUPABASE_SERVICE_ROLE_KEY='private-service-key';let payload:any;
 globalThis.fetch=async(_url:any,init:any)=>{payload=JSON.parse(init.body);return Response.json(null);};
 await synchronizeAdminPolicy();assert.deepEqual(payload,{p_email_hashes:[]});
});
test('policy storage failures fail closed and a later successful sync can recover',async()=>{
 process.env.ADMIN_EMAILS='retry-unlimited@example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='private-service-key';
 globalThis.fetch=async()=>Response.json({}, {status:503});await assert.rejects(synchronizeAdminPolicy(),/could not be verified/);
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(null);};await synchronizeAdminPolicy();assert.equal(calls,1);
});
test('administrator profile labels cannot fabricate unlimited access in fallback usage',()=>{
 const usage=getFallbackWorkspaceUsage({plan:'administrator',role:'admin'} as any,[],[]);
 assert.equal(usage.plan.id,'free');assert.ok(Number.isFinite(usage.aiLimit));assert.ok(Number.isFinite(usage.messageLimit));
});
test('preview deployments cannot replace production administrator policy',async()=>{
 process.env.VERCEL_ENV='preview';process.env.ADMIN_EMAILS='preview-only@example.test';
 globalThis.fetch=async()=>{throw Error('Preview must not mutate production entitlement policy');};
 await synchronizeAdminPolicy();
});
