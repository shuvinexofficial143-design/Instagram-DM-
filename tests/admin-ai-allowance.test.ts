import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdminOperation} from '../src/server/adminOperations';

const admin={id:'12345678-1234-4234-8234-123456789012',email:'admin@example.test'};
const owner='22345678-1234-4234-8234-123456789012';
const workspace='32345678-1234-4234-8234-123456789012';
const originalFetch=globalThis.fetch;
const originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
test.beforeEach(()=>{process.env.SUPABASE_SERVICE_ROLE_KEY='private-test-key';});
test.afterEach(()=>{
 globalThis.fetch=originalFetch;
 if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
});
function request(mode:string,limit:number|null,expiresAt:null|string=null){
 return {query:{action:'admin-ai-allowance'},body:{workspaceId:workspace,mode,limit,expiresAt}};
}
function fixture(opts:{afterLimit:number|null;afterMode?:string;expectedMode:string;expectedLimit:number|null}){
 const calls:{url:string;payload:any}[]=[];
 let entitlementRead=0;
 globalThis.fetch=async(url:any,init:any)=>{
  const u=String(url),payload=init?.body?JSON.parse(init.body):undefined;
  calls.push({url:u,payload});
  if(u.includes('autoreply_instagram_memberships?'))return Response.json([{workspace_id:workspace,owner_user_id:owner,profile:{}}]);
  if(u.includes('rpc/autoreply_billing_entitlement')){
    const after=++entitlementRead===2;
    return Response.json({plan:'free',planName:'Free',aiUsed:12,aiLimit:after?opts.afterLimit:200,aiAllowanceMode:after?opts.afterMode||opts.expectedMode:'plan'});
  }
  if(u.includes('rpc/autoreply_set_ai_allowance')){
    assert.equal(payload.p_workspace,workspace);
    assert.equal(payload.p_actor,admin.id);
    assert.equal(payload.p_mode,opts.expectedMode);
    assert.equal(payload.p_limit,opts.expectedLimit);
    assert.equal(payload.p_expires,null);
    return Response.json({ok:true});
  }
  if(u.includes('autoreply_admin_audit_logs'))return Response.json([]);
  throw Error('Unexpected or unsafe downstream request: '+u);
 };
 return calls;
}
test('admin can grant 10,000 monthly AI replies on a free plan without changing purchases',async()=>{
 const calls=fixture({expectedMode:'custom',expectedLimit:10000,afterMode:'custom',afterLimit:10000});
 const result=await runAdminOperation(request('custom',10000),admin);
 assert.equal(result.ok,true);
 assert.equal(result.entitlement.plan,'free');
 assert.equal(result.entitlement.aiLimit,10000);
 assert.equal(result.entitlement.aiAllowanceMode,'custom');
 assert.ok(calls.some(c=>c.url.includes('autoreply_admin_audit_logs')));
 assert.equal(calls.filter(c=>c.url.includes('rpc/autoreply_billing_entitlement')).length,2);
 assert.equal(calls.filter(c=>c.url.includes('rpc/autoreply_set_ai_allowance')).length,1);
 assert.ok(!calls.some(c=>/billing_orders|billing_subscriptions|checkout|cashfree/i.test(c.url)));
});
test('restoring default reverts to free or purchased plan without deleting customer records',async()=>{
 const calls=fixture({expectedMode:'plan',expectedLimit:null,afterMode:'plan',afterLimit:200});
 const result=await runAdminOperation(request('plan',null),admin);
 assert.equal(result.entitlement.aiLimit,200);
 assert.equal(result.entitlement.aiAllowanceMode,'plan');
 assert.ok(!calls.some(c=>/\/DELETE|delete|subscriptions|autoreply_documents/.test(c.url)));
});
test('invalid or unsafe admin grants never call the quota mutation',async()=>{
 for(const [mode,limit] of [['extra',0],['custom',-1],['custom',1.5],['custom',2147483648],['unexpected',10000]] as const){
  const calls=fixture({expectedMode:'custom',expectedLimit:10000,afterLimit:10000});
  await assert.rejects(runAdminOperation(request(mode,limit),admin),/valid AI reply limit/);
  assert.equal(calls.filter(c=>c.url.includes('rpc/autoreply_set_ai_allowance')).length,0);
 }
});
