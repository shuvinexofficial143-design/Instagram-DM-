import assert from 'node:assert/strict';import test from 'node:test';
import threadControl from '../src/server/threadControl';
import adminHandler from '../src/server/adminAccess';
import {runAdminOperation} from '../src/server/adminOperations';
const owner='12345678-1234-4234-8234-123456789012',foreign='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sender='770000000000001';
const originalFetch=globalThis.fetch,env={...process.env};
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);});
const res=()=>({statusCode:200,body:null as any,setHeader(){},status(c:number){this.statusCode=c;return this;},json(v:any){this.body=v;return this;}});
const req=(body:any,headers:any={authorization:'Bearer session','x-autoreply-workspace':owner})=>({method:'POST',headers,body,query:{}});
test('owner Resume AI uses verified workspace and receives server control version',async()=>{
 process.env.SUPABASE_SERVICE_ROLE_KEY='private-key';let payload:any;
 globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:owner});payload=JSON.parse(init.body);return Response.json({id:sender,paused:false,updated_at:'server-version'});};
 const r=res();await threadControl(req({senderId:sender,paused:false,workspaceId:foreign}),r);assert.equal(r.statusCode,200);assert.equal(payload.p_workspace,owner);assert.equal(r.body.control.updated_at,'server-version');
});
test('forged, missing and foreign owner controls cannot resume any thread',async()=>{
 globalThis.fetch=async(url:any)=>String(url).includes('/auth/')?Response.json({id:owner}):Response.json([]);
 const r=res();await threadControl(req({senderId:sender,paused:false},{authorization:'Bearer session','x-autoreply-workspace':foreign}),r);assert.equal(r.statusCode,403);
 const missing=res();await threadControl(req({senderId:sender,paused:false},{}),missing);assert.equal(missing.statusCode,401);
});
test('handoff list and detail never accept a non-admin or client actor override',async()=>{
 process.env.ADMIN_EMAILS='admin@example.test';globalThis.fetch=async()=>Response.json({id:owner,email:'customer@example.test',email_confirmed_at:'now'});
 for(const action of ['admin-handoffs','admin-handoff-detail','admin-handoff-action','admin-handoff-reply']){const r=res();await adminHandler({method:action.includes('action')||action.includes('reply')?'POST':'GET',query:{action,id},headers:{authorization:'Bearer session'},body:{id,actor:'admin',workspaceId:foreign}},r);assert.equal(r.statusCode,403);}
});
test('admin resume derives the real thread and rejects already resumed requests',async()=>{
 process.env.SUPABASE_SERVICE_ROLE_KEY='private-key';let payload:any;let status='waiting';
 globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('autoreply_human_handoffs?'))return Response.json([{id,workspace_id:owner,sender_id:sender,status}]);if(String(url).includes('set_thread_control')){payload=JSON.parse(init.body);return Response.json({paused:false});}return Response.json([]);};
 const q={query:{action:'admin-handoff-action'},body:{id,operation:'resume',workspaceId:foreign}};await runAdminOperation(q,{id:foreign,email:'admin@example.test'});assert.equal(payload.p_workspace,owner);assert.equal(payload.p_sender,sender);assert.equal(payload.p_handoff_id,id);
 status='resumed';await assert.rejects(runAdminOperation(q,{id:foreign}),/already been resumed/);
});
