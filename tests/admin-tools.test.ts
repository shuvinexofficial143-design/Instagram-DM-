import test from 'node:test';
import assert from 'node:assert/strict';
import adminHandler from '../src/server/adminAccess';
import {adminOperationMethods,parseCampaignIdentifiers,validateAdminAutomation,runAdminOperation} from '../src/server/adminOperations';
const uid='12345678-1234-4234-8234-123456789012',workspace='22345678-1234-4234-8234-123456789012',cid='32345678-1234-4234-8234-123456789012';
const identity={id:uid,email:'admin@example.test',email_confirmed_at:'2026-01-01'};
const originalFetch=globalThis.fetch,environment={ADMIN_EMAILS:process.env.ADMIN_EMAILS,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
test.beforeEach(()=>{process.env.ADMIN_EMAILS=identity.email;process.env.SUPABASE_SERVICE_ROLE_KEY='server-private-test';});
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const [k,v]of Object.entries(environment))if(v===undefined)delete process.env[k];else process.env[k]=v;});
const req=(action:string,body:any={},method=adminOperationMethods[action])=>({query:{action},body,method,headers:{authorization:'Bearer session'}});
function res(){return{statusCode:200,body:null as any,setHeader(){},status(v:number){this.statusCode=v;return this;},json(v:any){this.body=v;return this;}};}
const rule=()=>({id:'auto_fixture_one',name:'Example',trigger_type:'dm_ai_conversation',status:'paused',trigger_config:{},actions:[{type:'ai_chatbot',ai_system_instruction:'Answer enquiries'},{type:'send_dm',message_text:'Please wait'}]});
test('all new administrator routes reject a non-admin before touching private storage',async()=>{
 let storageCalls=0;globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({...identity,email:'customer@example.test'});storageCalls++;throw Error('must not access');};
 for(const [action,method] of Object.entries(adminOperationMethods)){const output=res();await adminHandler(req(action,{actor:uid,email:identity.email},method),output);assert.equal(output.statusCode,403,action);}
 assert.equal(storageCalls,0);
});
test('missing sessions and incorrect methods cannot run new administrator mutations',async()=>{
 globalThis.fetch=async()=>Response.json({}, {status:401});const output=res();await adminHandler(req('admin-automation-save'),output);assert.equal(output.statusCode,401);
 const method=res();await adminHandler(req('admin-campaign-create',{},'GET'),method);assert.equal(method.statusCode,405);
});
test('recipient parser normalizes, deduplicates and rejects malformed or excessive lists',()=>{
 assert.deepEqual(parseCampaignIdentifiers('@Customer_A,customer_a;770000000000001\n@Other.user'),['customer_a','770000000000001','other.user']);
 for(const v of ['',null,'https://instagram.com/user','customer<script>','a'.repeat(30001),Array.from({length:501},(_,i)=>'user'+i).join('\n')])assert.throws(()=>parseCampaignIdentifiers(v));
});
test('automation validation checks AI prompt, empty replies, keywords, actions and media scope',()=>{
 assert.equal(validateAdminAutomation(rule()).name,'Example');
 const invalid=[{...rule(),actions:[{type:'ai_chatbot',ai_system_instruction:''}]},{...rule(),actions:[{type:'unknown'}]},{...rule(),actions:[{type:'send_dm',message_text:''}]},{...rule(),trigger_config:{all_or_keywords:'keywords',keywords:[]}},{...rule(),trigger_config:{media_scope:'specific_media'}},{...rule(),status:'on'}];
 for(const v of invalid)assert.throws(()=>validateAdminAutomation(v));
});
test('admin automation changes use the verified actor and selected workspace, never forged identity fields',async()=>{
 let payload:any;globalThis.fetch=async(url:any,init:any)=>{
  if(String(url).includes('/auth/'))return Response.json(identity);
  if(String(url).includes('rpc/autoreply_sync_admin_allowlist'))return Response.json(null);
  if(String(url).includes('memberships?'))return Response.json([{workspace_id:workspace,owner_user_id:'another-owner'}]);
  assert.ok(String(url).endsWith('/rpc/autoreply_admin_edit_automation'));payload=JSON.parse(init.body);assert.equal(init.headers.apikey,'server-private-test');return Response.json({ok:true,automation:rule()});
 };
 const output=res();await adminHandler(req('admin-automation-save',{workspaceId:workspace,automation:rule(),actor:'forged',email:'forged@example.test',overrideLimit:true}),output);
 assert.equal(output.statusCode,200);assert.equal(payload.p_actor,uid);assert.equal(payload.p_email,identity.email);assert.equal(payload.p_workspace,workspace);assert.equal(payload.p_override,true);
});
test('campaign preview and creation cannot use another customer’s sender account',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json([{workspace_id:workspace,owner_user_id:'other-owner'}]);};
 for(const action of ['admin-campaign-preview','admin-campaign-create'])await assert.rejects(runAdminOperation(req(action,{workspaceId:workspace,identifiers:'@user'}),identity),e=>(e as any).status===403);
 assert.equal(calls,2);
});
test('campaign detail does not reveal a campaign owned by another administrator',async()=>{
 globalThis.fetch=async(url:any)=>{assert.ok(String(url).includes('created_by=eq.'+uid));return Response.json([]);};
 await assert.rejects(runAdminOperation({...req('admin-campaign-detail'),query:{action:'admin-campaign-detail',id:cid}},identity),e=>(e as any).status===404);
});
test('stopped and concurrently changed campaigns cannot be silently resumed',async()=>{
 let writes=0;globalThis.fetch=async(_url:any,init:any)=>{if(init.method==='GET')return Response.json([{id:cid,status:'stopped',prompt:'Help',created_by:uid}]);writes++;return Response.json([]);};
 await assert.rejects(runAdminOperation(req('admin-campaign-action',{id:cid,operation:'resume'}),identity),/Only paused/);assert.equal(writes,0);
 globalThis.fetch=async(url:any,init:any)=>{if(init.method==='GET')return Response.json([{id:cid,status:'paused',prompt:'Help',created_by:uid}]);assert.ok(String(url).includes('status=eq.paused'));return Response.json([]);};
 await assert.rejects(runAdminOperation(req('admin-campaign-action',{id:cid,operation:'resume'}),identity),e=>(e as any).status===409);
});
