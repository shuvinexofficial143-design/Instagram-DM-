import assert from 'node:assert/strict';
import test from 'node:test';
import {requestAutomationMutation} from '../src/lib/automationMutations';
import handler from '../api/automations';
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
const rule={id:'auto_fixture_one',name:'Fixture',trigger_type:'dm',trigger_config:{},actions:[{type:'send_dm',message_text:'Hello'}],status:'paused'} as any;
const scope=()=>({workspaceId:'workspace-a',ownerId:'owner-a',currentOwnerId:()=> 'owner-a',getToken:async()=> 'verified-session'});
test('saving stays pending until the server confirms the record',async()=>{
 let release!:(v:Response)=>void;let settled=false;
 globalThis.fetch=()=>new Promise<Response>(resolve=>{release=resolve;});
 const saving=requestAutomationMutation({method:'POST',automation:rule},scope()).then(value=>{settled=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
 release(Response.json({ok:true,automation:{...rule,name:'Confirmed name'}}));assert.equal((await saving).automation.name,'Confirmed name');
});
test('failed validation is surfaced without retrying or pretending the draft was saved',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:false,error:'Plan limit reached'},{status:403});};
 await assert.rejects(requestAutomationMutation({method:'POST',automation:rule},scope()),/Plan limit reached/);assert.equal(calls,1);
});
test('a network retry remains pinned to the original workspace and rule ID',async()=>{
 const writes:any[]=[];globalThis.fetch=async(url:any,init:any)=>{writes.push({url,headers:init.headers,body:JSON.parse(init.body)});if(writes.length===1)throw new TypeError('Network lost');return Response.json({ok:true,automation:rule});};
 await requestAutomationMutation({method:'POST',automation:rule},scope());assert.equal(writes.length,2);
 for(const row of writes){assert.equal(row.headers['X-Autoreply-Workspace'],'workspace-a');assert.equal(row.body.automation.id,rule.id);}
});
test('switching logins while obtaining a token stops the write before dispatch',async()=>{
 let owner='owner-a',calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true,automation:rule});};
 await assert.rejects(requestAutomationMutation({method:'POST',automation:rule},{...scope(),currentOwnerId:()=>owner,getToken:async()=>{owner='owner-b';return 'other-session';}}),/login changed/);assert.equal(calls,0);
});
test('a login change between network retries cannot save under the replacement login',async()=>{
 let owner='owner-a',calls=0;globalThis.fetch=async()=>{calls++;owner='owner-b';throw new TypeError('Network lost');};
 await assert.rejects(requestAutomationMutation({method:'POST',automation:rule},{...scope(),currentOwnerId:()=>owner}),/login changed/);assert.equal(calls,1);
});
test('a successful HTTP response without a saved record is not a successful save',async()=>{
 globalThis.fetch=async()=>Response.json({ok:true});await assert.rejects(requestAutomationMutation({method:'POST',automation:rule},scope()),/did not confirm/);
});
test('a failed delete remains a failed operation and uses the exact account and ID',async()=>{
 const writes:any[]=[];globalThis.fetch=async(url:any,init:any)=>{writes.push({url,headers:init.headers});return Response.json({ok:false,error:'Delete unavailable'},{status:503});};
 await assert.rejects(requestAutomationMutation({method:'DELETE',id:rule.id},scope()),/Delete unavailable/);assert.ok(writes.every(row=>row.url.includes(rule.id)&&row.headers['X-Autoreply-Workspace']==='workspace-a'));
});
test('the API relays a server save rejection, including the plan error code',async()=>{
 const owner='00000000-0000-4000-8000-000000000098';let saves=0;
 globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/v1/user'))return Response.json({id:owner});saves++;const payload=JSON.parse(init.body);assert.equal(payload.workspaceId,owner);assert.equal(payload.action,'save_automation');return Response.json({ok:false,code:'AUTOMATION_LIMIT_REACHED',error:'Plan limit reached'},{status:403});};
 const res={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:any){this.body=value;return this;}};
 await handler({method:'POST',headers:{authorization:'Bearer valid'},body:{automation:rule}},res);assert.equal(res.statusCode,403);assert.equal(res.body.code,'AUTOMATION_LIMIT_REACHED');assert.equal(saves,1);
});
