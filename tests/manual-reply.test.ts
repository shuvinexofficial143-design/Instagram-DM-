import assert from 'node:assert/strict';
import test from 'node:test';
import {dispatchManualReply} from '../src/lib/manualReply';
const original=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=original;});
const input={workspaceId:'workspace-a',ownerId:'owner-a',username:'customer',text:'Keep this draft',currentOwnerId:()=> 'owner-a',getToken:async()=> 'verified'};
test('a successful manual send requires a confirmed Meta message',async()=>{
 globalThis.fetch=async(url:any,init:any)=>{assert.equal(url,'/api/instagram/send-dm');assert.equal(init.headers['X-Autoreply-Workspace'],'workspace-a');assert.equal(init.headers.Authorization,'Bearer verified');return Response.json({ok:true,sent:true,message_id:'meta-id',message:{id:'meta-id',message_text:input.text}});};
 assert.equal((await dispatchManualReply(input)).id,'meta-id');
});
test('refusals and ambiguous responses reject so a composer keeps its draft and bulk sends count failures',async()=>{
 for(const body of [{ok:false,error:'Missing permission'},{ok:true,sent:false},{ok:true,sent:true}]){
  globalThis.fetch=async()=>Response.json(body);
  await assert.rejects(dispatchManualReply(input));
 }
});
test('a lost send response is never automatically retried',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw new TypeError('Connection lost');};
 await assert.rejects(dispatchManualReply(input),/Connection lost/);assert.equal(calls,1);
});
test('changing logins while obtaining a token prevents sending with the replacement login',async()=>{
 let owner='owner-a',calls=0;globalThis.fetch=async()=>{calls++;return Response.json({});};
 await assert.rejects(dispatchManualReply({...input,currentOwnerId:()=>owner,getToken:async()=>{owner='owner-b';return 'new-token';}}),/login changed/);assert.equal(calls,0);
});
