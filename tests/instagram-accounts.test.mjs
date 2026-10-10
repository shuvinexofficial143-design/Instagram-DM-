import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { webcrypto } from 'node:crypto';
const source=(await fs.readFile(new URL('../supabase/functions/instagram-account-store/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const compiled=await transform(source,{loader:'ts',format:'esm'});
const owner='12345678-1234-4234-8234-123456789012';
function fixture(maxAccounts=5){
  let handler, business='business-a', fetches=0;
  const tables={autoreply_instagram_memberships:[],autoreply_instagram_tokens:[],autoreply_documents:[]};
  const uploadPaths=[];
  const admin={rpc: async(name)=>({data: name==='autoreply_billing_entitlement'?{accounts:maxAccounts,automationLimit:5}:null,error:null}),storage:{getBucket:async()=>({data:{id:'catalog-images'},error:null}),from:()=>({createSignedUploadUrl:async path=>{uploadPaths.push(path);return {data:{token:'signed-upload'}};},getPublicUrl:path=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/catalog-images/'+path}})})},auth:{getUser:async jwt=>jwt==='session' ? {data:{user:{id:owner}}} : {data:null,error:{message:'Unauthorized'}}},from(table){
    let filters={},sets={},mutation;
    const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){sets[k]=v;return q;},order(){return q;},
      upsert(value){mutation=value;return q;},async maybeSingle(){return result(true);},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};
    function result(single){
      const rows=tables[table]||[];
      if(mutation){const key=table==='autoreply_instagram_memberships'?'workspace_id':table==='autoreply_instagram_tokens'?'user_id':'id';
        const found=rows.find(row=>row[key]===mutation[key]&&(key!=='id'||row.user_id===mutation.user_id&&row.collection===mutation.collection));
        if(found)Object.assign(found,mutation);else rows.push({...mutation});return {data:null,error:null};}
      const matches=rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v)&&Object.entries(sets).every(([k,v])=>v.includes(row[k])));
      return {data:single?matches[0]||null:matches,error:null,count:matches.length};
    }return q;
  }};
  const context=vm.createContext({crypto:webcrypto,Request,Response,URLSearchParams,AbortSignal,console:{log(){},warn(){},error(){}},
    createClient:()=>admin,fetch:async()=>{fetches++;return Response.json({id:business,username:business,profile_picture_url:'photo-url',followers_count:3});},
    Deno:{env:{get:name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-service',INSTAGRAM_APP_SECRET:'oauth-secret'})[name]},serve:callback=>handler=callback}});
  vm.runInContext(compiled.code,context);
  return {tables,uploadPaths,setBusiness:value=>business=value,get fetches(){return fetches;},async post(body,headers={}){
    const response=await handler(new Request('https://example.supabase.co/functions/v1/instagram-account-store',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json()};
  },save(workspaceId=owner){return this.post({action:'save',ownerId:owner,workspaceId,accessToken:'private-instagram-token'},{'x-autoreply-oauth-secret':'oauth-secret'});}};
}
test('adding a second Instagram account keeps the original connection and data workspace',async()=>{
 const f=fixture();assert.equal((await f.save()).status,200);f.setBusiness('business-b');const saved=await f.save();
 assert.equal(saved.status,200);assert.notEqual(saved.body.workspaceId,owner);
 assert.equal(f.tables.autoreply_instagram_tokens.length,2);
 assert.equal(f.tables.autoreply_instagram_tokens.find(row=>row.user_id===owner).account.ig_user_id,'business-a');
 assert.equal(f.tables.autoreply_instagram_memberships.length,2);
});
test('additional Instagram account is blocked when plan allowance is exhausted',async()=>{
 const f=fixture(1);assert.equal((await f.save()).status,200);
 f.setBusiness('business-b');
 const denied=await f.save();assert.equal(denied.status,403);
 assert.equal(denied.body.code,'INSTAGRAM_ACCOUNT_LIMIT_REACHED');
 assert.equal(f.tables.autoreply_instagram_tokens.length,1);
});
test('reconnecting an existing account reuses its workspace rather than duplicating it',async()=>{
 const f=fixture();await f.save();const saved=await f.save('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(saved.body.workspaceId,owner);assert.equal(f.tables.autoreply_instagram_memberships.length,1);assert.equal(f.tables.autoreply_instagram_tokens.length,1);
});
test('registration cannot move another login’s Instagram account',async()=>{
 const f=fixture();f.tables.autoreply_instagram_memberships.push({workspace_id:'foreign',owner_user_id:'another-login',ig_user_id:'business-a'});
 const saved=await f.save();assert.equal(saved.status,409);assert.equal(f.tables.autoreply_instagram_tokens.length,0);
});
test('account listing requires a real session and never returns Instagram tokens',async()=>{
 const f=fixture();await f.save();const unauth=await f.post({action:'list_accounts'});assert.equal(unauth.status,401);
 const saved=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});assert.equal(saved.status,200);assert.equal(saved.body.accounts[0].workspaceId,owner);
 assert.ok(!JSON.stringify(saved.body).includes('private-instagram-token'));assert.ok(!JSON.stringify(saved.body).includes('access_token'));
});
test('unverified account saves are rejected before contacting Meta',async()=>{
 const f=fixture();const saved=await f.post({action:'save',ownerId:owner,workspaceId:owner,accessToken:'any-token'});
 assert.equal(saved.status,401);assert.equal(f.fetches,0);
});
test('a user cannot load or delete another Instagram workspace',async()=>{
 const f=fixture();await f.save();for(const action of ['load','delete','list_automations','refresh_contact_profiles']){
   const result=await f.post({action,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{Authorization:'Bearer session'});
   assert.equal(result.status,403);
 }
});


test('reconnecting the same verified account preserves business sender scopes', async () => {
  const f = fixture(); await f.save();
  f.tables.autoreply_instagram_tokens[0].account.own_sender_ids = ['1349115649944643'];
  await f.save();
  assert.deepEqual(f.tables.autoreply_instagram_tokens[0].account.own_sender_ids, ['1349115649944643']);
  f.setBusiness('business-b'); await f.save();
  assert.equal(f.tables.autoreply_instagram_tokens.find(r => r.account.ig_user_id === 'business-b').account.own_sender_ids, undefined);
});

test('catalog image uploads require a session and workspace ownership',async()=>{
 const f=fixture();const body={action:'create_catalog_upload',workspaceId:owner,catalogId:'watches',mimeType:'image/jpeg',size:1000};
 assert.equal((await f.post(body)).status,401);
 assert.equal((await f.post({...body,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{Authorization:'Bearer session'})).status,403);
 assert.equal(f.uploadPaths.length,0);
 const uploaded=await f.post(body,{Authorization:'Bearer session'});assert.equal(uploaded.status,200);assert.ok(uploaded.body.path.startsWith(owner+'/watches/'));assert.ok(uploaded.body.path.endsWith('.jpg'));assert.ok(uploaded.body.publicUrl.includes(uploaded.body.path));
});
test('catalog uploads reject unsafe types, oversized files and path traversal',async()=>{
 const f=fixture();for(const input of [{mimeType:'image/svg+xml'},{size:6*1024*1024},{size:0},{catalogId:'../foreign'}]){
 const result=await f.post({action:'create_catalog_upload',workspaceId:owner,catalogId:'default',mimeType:'image/png',size:1000,...input},{Authorization:'Bearer session'});assert.equal(result.status,400);
 }assert.equal(f.uploadPaths.length,0);
});
