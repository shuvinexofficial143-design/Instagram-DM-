import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source=(await fs.readFile(new URL('../api/workspace-data.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
const compiled=(await transform(source+'\nglobalThis.handler=handler;',{loader:'ts'})).code;
async function relay(req,options={}) {
 const calls=[];
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,SUPABASE_URL:'https://project.supabase.co',guestStoreHeaders:()=>({'x-private-relay':'server-only'}),
  authenticatedWorkspace:async()=>{if(options.denied)throw Object.assign(Error('Forbidden'),{status:403});return options.expired?null:{id:'selected-workspace'};},
  httpFetch:async(url,init)=>{calls.push({url,headers:init.headers,body:JSON.parse(init.body)});return Response.json(options.body||{ok:true},{status:options.status||200});}});
 vm.runInContext(compiled,context);
 const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
 await context.handler(req,res);return {res,calls};
}
const request={method:'POST',query:{action:'inbox-read'},headers:{authorization:'Bearer session','x-autoreply-workspace':'selected-workspace'},body:{sender:'123456789',read:true,workspaceId:'forged'}};
test('authenticated mark-read uses the verified selected workspace and existing Edge RPC',async()=>{
 const {res,calls}=await relay(request);assert.equal(res.statusCode,200);assert.equal(res.body.ok,true);
 assert.equal(calls[0].body.workspaceId,'selected-workspace');assert.equal(calls[0].body.action,'mark_inbox_read');assert.equal(calls[0].body.sender,'123456789');assert.equal(calls[0].headers.Authorization,'Bearer session');
});
test('foreign, expired and missing sessions cannot select another workspace or fall back to a guest cookie',async()=>{
 for(const [options,status] of [[{denied:true},403],[{expired:true},401]]){
  const {res,calls}=await relay({...request,headers:{...request.headers,cookie:'autoreply_guest_workspace=guest_1234567890abcdef'}},options);
  assert.equal(res.statusCode,status);assert.equal(calls.length,0);
 }
 const {res,calls}=await relay({...request,headers:{}});assert.equal(res.statusCode,401);assert.equal(calls.length,0);
});
test('guest mark-read retains its private relay and rejects the wrong HTTP method',async()=>{
 const {res,calls}=await relay({...request,headers:{cookie:'autoreply_guest_workspace=guest_1234567890abcdef'}});
 assert.equal(res.statusCode,200);assert.equal(calls[0].body.workspaceId,'guest_1234567890abcdef');assert.equal(calls[0].headers.Authorization,undefined);
 assert.equal((await relay({...request,method:'GET'})).res.statusCode,405);
});
test('an Edge refusal remains a failure and cannot mark the UI read successfully',async()=>{
 const {res}=await relay(request,{body:{ok:false,error:'Inbox data could not be loaded.'},status:500});assert.equal(res.statusCode,500);assert.equal(res.body.ok,false);
});
