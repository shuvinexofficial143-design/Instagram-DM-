import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileAutomationRecords} from '../src/lib/automationState';
import handler from '../api/automations';
const rule=(status='active',updated='2026-10-19T04:00:00Z')=>({id:'auto_rule_one',name:'AI rule',status,updated_at:updated,trigger_type:'dm_ai_conversation',actions:[],stats:{runs:1}} as any);
test('an old read cannot turn a confirmed OFF switch back ON',()=>{
 const off=rule('paused','2026-10-19T05:00:00Z');
 assert.equal(reconcileAutomationRecords([off],[rule()])[0].status,'paused');
 const pending=new Map([['auto_rule_one','paused' as const]]);
 assert.equal(reconcileAutomationRecords([rule()],[rule()],pending)[0].status,'paused');
 assert.equal(reconcileAutomationRecords([rule()],[],pending)[0].status,'paused');
});
test('a later explicit ON and fresh statistics remain visible',()=>{
 const off=rule('paused','2026-10-19T05:00:00Z'),on=rule('active','2026-10-19T06:00:00Z');
 assert.equal(reconcileAutomationRecords([off],[on])[0].status,'active');
 assert.equal(reconcileAutomationRecords([on],[{...on,stats:{runs:4}}])[0].stats.runs,4);
});
const uid='12345678-1234-4234-8234-123456789012',original=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=original;});
function res(){return {statusCode:200,body:null as any,headers:{} as any,setHeader(k:string,v:any){this.headers[k]=v;},status(c:number){this.statusCode=c;return this;},json(v:any){this.body=v;return this;}};}
const req=(body:any={automationId:'auto_rule_one',status:'paused'})=>({method:'PATCH',body,query:{},headers:{authorization:'Bearer session','x-autoreply-workspace':uid}});
test('status PATCH sends only verified workspace, ID and desired status',async()=>{
 let writes=0;globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});writes++;const body=JSON.parse(init.body);assert.deepEqual(body,{action:'set_automation_status',workspaceId:uid,automationId:'auto_rule_one',status:'paused'});return Response.json({ok:true,automation:rule('paused')});};
 const output=res();await handler(req(),output);assert.equal(output.statusCode,200);assert.equal(output.body.automation.status,'paused');assert.equal(writes,1);
});
test('invalid status and expired identity cannot change automation settings',async()=>{
 let writes=0;globalThis.fetch=async(url:any)=>{if(String(url).includes('/auth/'))return Response.json({id:uid});writes++;return Response.json({});};
 const invalid=res();await handler(req({automationId:'auto_rule_one',status:'anything'}),invalid);assert.equal(invalid.statusCode,400);assert.equal(writes,0);
 globalThis.fetch=async()=>Response.json({}, {status:401});const expired=res();await handler(req(),expired);assert.equal(expired.statusCode,401);
});
test('a status save failure is reported instead of pretending OFF was persisted',async()=>{
 globalThis.fetch=async(url:any)=>String(url).includes('/auth/')?Response.json({id:uid}):Response.json({ok:false,error:'Status save unavailable'},{status:503});
 const output=res();await handler(req(),output);assert.equal(output.statusCode,503);assert.equal(output.body.ok,false);
});
