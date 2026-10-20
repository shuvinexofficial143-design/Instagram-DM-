import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/instagram/account';
const owner='12345678-1234-4234-8234-123456789012', second='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
function response(){return {statusCode:200,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;}};}
function req(method='GET',workspace=owner){return {method,query:{},body:method==='POST'?{account:null}:{},headers:{authorization:'Bearer session','x-autoreply-workspace':workspace,cookie:'autoreply_active_workspace='+owner}};}
const accounts=[{workspaceId:owner,account:{username:'shop-one',status:'disconnected'}},{workspaceId:second,account:{username:'shop-two',status:'connected'}}];
test('disconnected memberships disappear and stale selection falls back to a connected account',async()=>{
 globalThis.fetch=async(url:any)=>Response.json(String(url).includes('/auth/')?{id:owner}:{ok:true,accounts});
 const res=response();await handler(req(),res);assert.equal(res.statusCode,200);assert.equal(res.body.account.username,'shop-two');assert.equal(res.body.accounts.length,1);assert.equal(res.body.activeWorkspaceId,second);assert.match(res.headers['Cache-Control'],/no-store/);
});
test('disconnect targets the explicit selected workspace instead of a stale cookie',async()=>{
 let deleted='';globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:owner});const body=JSON.parse(init.body);if(body.action==='delete'){deleted=body.workspaceId;return Response.json({ok:true,account:null});}return Response.json({ok:true,accounts});};
 const res=response();await handler(req('POST',second),res);assert.equal(res.statusCode,200);assert.equal(deleted,second);
});
test('disconnect failure is returned instead of silently claiming success',async()=>{
 globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:owner});return JSON.parse(init.body).action==='delete'?Response.json({ok:false,error:'Disconnect could not be saved'},{status:503}):Response.json({ok:true,accounts});};
 const res=response();await handler(req('POST'),res);assert.equal(res.statusCode,503);assert.equal(res.body.ok,false);
});
test('a forged workspace or expired session cannot disconnect an account',async()=>{
 let writes=0;globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:owner});if(String(url).includes('/rest/'))return Response.json([]);if(JSON.parse(init.body).action==='delete')writes++;return Response.json({ok:true,accounts});};
 const res=response();await handler(req('POST','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),res);assert.equal(res.statusCode,403);assert.equal(writes,0);
 globalThis.fetch=async()=>Response.json({}, {status:401});const invalid=response();await handler(req('POST'),invalid);assert.equal(invalid.statusCode,401);
});

test('disconnect clears the selection cookie and removes the last account from the response',async()=>{
 globalThis.fetch=async(url:any,init:any)=>String(url).includes('/auth/')?Response.json({id:owner}):Response.json(JSON.parse(init.body).action==='delete'?{ok:true}:{ok:true,accounts:[{workspaceId:owner,account:{username:'shop',status:'connected'}}]});
 const res=response();await handler(req('POST'),res);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body.accounts,[]);assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('an idempotent disconnect retry verifies the archived owner and clears the stale cookie',async()=>{
 let deletes=0;globalThis.fetch=async(url:any,init:any)=>{if(String(url).includes('/auth/'))return Response.json({id:owner});if(String(url).includes('/rest/'))return Response.json([{workspace_id:second}]);if(JSON.parse(init.body).action==='delete'){deletes++;return Response.json({ok:true});}return Response.json({ok:true,accounts:[]});};
 const res=response();await handler(req('POST',second),res);assert.equal(res.statusCode,200);assert.equal(deletes,1);assert.deepEqual(res.body.accounts,[]);
});
