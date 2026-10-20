import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../src/server/customerLifecycle';
const owner='00000000-0000-4000-8000-000000000097';
const originalFetch=globalThis.fetch;
const previousAdmins=process.env.ADMIN_EMAILS;
const previousService=process.env.SUPABASE_SERVICE_ROLE_KEY;
const previousResend=process.env.RESEND_API_KEY;
test.beforeEach(()=>{process.env.ADMIN_EMAILS='admin@example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';delete process.env.RESEND_API_KEY;});
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({ADMIN_EMAILS:previousAdmins,SUPABASE_SERVICE_ROLE_KEY:previousService,RESEND_API_KEY:previousResend})){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
function response(){return {statusCode:200,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:any){this.body=value;return this;}};}
function fixture(email='admin@example.test'){
 const writes:any[]=[];
 globalThis.fetch=async(url:any,init:any)=>{
  if(String(url).includes('/auth/v1/user'))return Response.json({id:owner,email,email_confirmed_at:'2026-10-20',is_anonymous:false});
  writes.push({url:String(url),method:init?.method,body:init?.body?JSON.parse(init.body):undefined});
  if(String(url).includes('autoreply_touch_email_lifecycle'))return Response.json({user_id:owner,email,marketing_opt_in:false});
  return Response.json([{marketing_opt_in:init?.method==='PATCH'?JSON.parse(init.body).marketing_opt_in:true,onboarding_stage:1}]);
 };return writes;
}
const req=(method='GET',body:any={})=>({method,query:{action:'mail-preferences'},headers:{authorization:'Bearer verified-session'},body});
test('ordinary users cannot read or change Admin email preferences',async()=>{
 const calls=fixture('customer@example.test');
 for(const method of ['GET','POST']){const res=response();await handler(req(method,{marketingOptIn:true}),res);assert.equal(res.statusCode,403);}
 assert.equal(calls.length,0);
});
test('verified administrators can read and save only their own email preference',async()=>{
 const calls=fixture();const read=response();await handler(req(),read);assert.equal(read.statusCode,200);assert.equal(read.body.marketingOptIn,true);
 const saved=response();await handler(req('POST',{marketingOptIn:false,userId:'another-user'}),saved);assert.equal(saved.statusCode,200);assert.equal(saved.body.marketingOptIn,false);
 const patch=calls.find(row=>row.method==='PATCH');assert.ok(patch.url.includes('user_id=eq.'+owner));assert.equal(patch.body.marketing_opt_in,false);assert.ok(!JSON.stringify(calls).includes('another-user'));
});
test('ordinary users can still record activity without enrolling in promotional mail',async()=>{
 const calls=fixture('customer@example.test');const res=response();await handler({...req('POST'),query:{action:'mail-activity'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.marketingOptIn,false);assert.equal(calls.length,1);
});
