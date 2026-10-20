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
  const admin={rpc: async(name,args={})=>{
    if(name==='autoreply_billing_entitlement')return {data:{accounts:maxAccounts,automationLimit:maxAccounts===null?null:5,unlimited:maxAccounts===null},error:null};
    if(name==='autoreply_disconnect_instagram_connection'){
      const m=tables.autoreply_instagram_memberships.find(row=>row.workspace_id===args.p_workspace_id);
      if(m){m.connection_archived=true;m.connection_archived_at=new Date().toISOString();m.profile={...m.profile,status:'disconnected'};}
      tables.autoreply_instagram_tokens=tables.autoreply_instagram_tokens.filter(row=>row.user_id!==args.p_workspace_id);
      tables.autoreply_documents=tables.autoreply_documents.filter(row=>row.user_id!==args.p_workspace_id||row.collection!=='instagram_account');
      return {data:{ok:true,account:null},error:null};
    }
    if(name==='autoreply_connect_instagram_account'){
      const account=args.p_account, ids=[account.ig_user_id,account.ig_scoped_id];
      const current=tables.autoreply_instagram_memberships.find(row=>!row.connection_archived&&ids.includes(row.ig_user_id));
      const token=tables.autoreply_instagram_tokens.find(row=>row.user_id===current?.workspace_id);
      if(current&&current.owner_user_id!==args.p_owner_id&&token?.account?.access_token)return {data:{ok:false,status:409,error:'This Instagram account is still connected to another login.'}};
      const own=tables.autoreply_instagram_memberships.find(row=>row.owner_user_id===args.p_owner_id&&ids.includes(row.ig_user_id));
      const count=tables.autoreply_instagram_memberships.filter(row=>row.owner_user_id===args.p_owner_id&&!row.connection_archived&&tables.autoreply_instagram_tokens.some(t=>t.user_id===row.workspace_id)).length;
      if(!token&&maxAccounts!==null&&count>=maxAccounts)return {data:{ok:false,status:403,code:'INSTAGRAM_ACCOUNT_LIMIT_REACHED'}};
      let target=own?.workspace_id||args.p_workspace_id;
      if(!own&&tables.autoreply_instagram_memberships.some(row=>row.workspace_id===target))target=webcrypto.randomUUID();
      if(current&&current.owner_user_id!==args.p_owner_id)current.connection_archived=true;
      const safe={...account};delete safe.access_token;
      if(token?.account?.own_sender_ids)account.own_sender_ids=token.account.own_sender_ids;
      if(own)Object.assign(own,{connection_archived:false,profile:safe});
      else tables.autoreply_instagram_memberships.push({workspace_id:target,owner_user_id:args.p_owner_id,ig_user_id:account.ig_user_id,profile:safe,connection_archived:false});
      tables.autoreply_instagram_tokens=tables.autoreply_instagram_tokens.filter(row=>row.user_id!==target);
      tables.autoreply_instagram_tokens.push({user_id:target,account});
      tables.autoreply_documents=tables.autoreply_documents.filter(row=>row.user_id!==target||row.collection!=='instagram_account');
      tables.autoreply_documents.push({user_id:target,collection:'instagram_account',id:'primary',data:safe});
      return {data:{ok:true,workspaceId:target,account:safe},error:null};
    }
    return {data:null,error:null};
  },storage:{getBucket:async()=>({data:{id:'catalog-images'},error:null}),from:()=>({createSignedUploadUrl:async path=>{uploadPaths.push(path);return {data:{token:'signed-upload'}};},getPublicUrl:path=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/catalog-images/'+path}})})},auth:{getUser:async jwt=>jwt==='session' ? {data:{user:{id:owner}}} : {data:null,error:{message:'Unauthorized'}}},from(table){
    let filters={},sets={},mutation,deleting=false;
    const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){sets[k]=v;return q;},order(){return q;},
      delete(){deleting=true;return q;},upsert(value){mutation=value;return q;},async maybeSingle(){return result(true);},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};
    function result(single){
      const rows=tables[table]||[];
      if(mutation){const key=table==='autoreply_instagram_memberships'?'workspace_id':table==='autoreply_instagram_tokens'?'user_id':'id';
        const found=rows.find(row=>row[key]===mutation[key]&&(key!=='id'||row.user_id===mutation.user_id&&row.collection===mutation.collection));
        if(found)Object.assign(found,mutation);else rows.push({...mutation});return {data:null,error:null};}
      const matches=rows.filter(row=>Object.entries(filters).every(([k,v])=>(row[k] ?? (k==='connection_archived'?false:undefined))===v)&&Object.entries(sets).every(([k,v])=>v.includes(row[k])));
      if(deleting){tables[table]=rows.filter(row=>!matches.includes(row));return {data:null,error:null};}
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
test('server-verified unlimited owner can add accounts beyond every paid plan count',async()=>{
 const f=fixture(null);
 for(let i=0;i<8;i++){f.setBusiness('admin-business-'+i);assert.equal((await f.save()).status,200);}
 assert.equal(f.tables.autoreply_instagram_memberships.length,8);
 assert.equal(f.tables.autoreply_instagram_tokens.length,8);
 f.tables.autoreply_instagram_memberships.push({workspace_id:'foreign',owner_user_id:'another-login',ig_user_id:'foreign-business'});
 f.tables.autoreply_instagram_tokens.push({user_id:'foreign',account:{access_token:'still-active'}});
 f.setBusiness('foreign-business');assert.equal((await f.save()).status,409);
});
test('reconnecting an existing account reuses its workspace rather than duplicating it',async()=>{
 const f=fixture();await f.save();const saved=await f.save('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(saved.body.workspaceId,owner);assert.equal(f.tables.autoreply_instagram_memberships.length,1);assert.equal(f.tables.autoreply_instagram_tokens.length,1);
});
test('registration cannot move another login’s Instagram account',async()=>{
 const f=fixture();f.tables.autoreply_instagram_memberships.push({workspace_id:'foreign',owner_user_id:'another-login',ig_user_id:'business-a'});
 f.tables.autoreply_instagram_tokens.push({user_id:'foreign',account:{access_token:'still-active'}});
 const saved=await f.save();assert.equal(saved.status,409);assert.equal(f.tables.autoreply_instagram_tokens.length,1);
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


test('disconnect is durable across account reload and retains ownership and customer data',async()=>{
 const f=fixture();await f.save();
 f.tables.autoreply_documents.push({user_id:owner,collection:'contacts',id:'customer',data:{full_name:'Customer'}});
 f.tables.autoreply_documents.push({user_id:owner,collection:'instagram_account',id:'legacy-account',data:{username:'business-a'}});
 assert.equal((await f.post({action:'delete',workspaceId:owner},{Authorization:'Bearer session'})).status,200);
 assert.equal(f.tables.autoreply_instagram_tokens.length,0);
 assert.equal(f.tables.autoreply_documents.filter(row=>row.collection==='instagram_account').length,0);
 assert.equal(f.tables.autoreply_documents.filter(row=>row.collection==='contacts').length,1);
 assert.equal(f.tables.autoreply_instagram_memberships.length,1);
 for(let retry=0;retry<3;retry++){
   const listing=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
   assert.deepEqual(listing.body.accounts,[]);
   assert.equal(f.tables.autoreply_instagram_tokens.length,0);
 }
 await f.save();
 const listing=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
 assert.equal(listing.body.accounts[0].workspaceId,owner);
 assert.equal(listing.body.accounts[0].account.status,'connected');
});

test('disconnecting one account never removes another connected account',async()=>{
 const f=fixture();await f.save();f.setBusiness('business-b');const second=await f.save();
 await f.post({action:'delete',workspaceId:owner},{Authorization:'Bearer session'});
 assert.equal(f.tables.autoreply_instagram_tokens.length,1);
 assert.equal(f.tables.autoreply_instagram_tokens[0].user_id,second.body.workspaceId);
 const list=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
 assert.equal(list.body.accounts.find(row=>row.workspaceId===second.body.workspaceId).account.status,'connected');
});


test('any selected account can disconnect without reconnecting itself or affecting other IDs',async()=>{
 const f=fixture();await f.save();f.setBusiness('business-b');const second=await f.save();f.setBusiness('business-c');const third=await f.save();
 for(const id of [second.body.workspaceId,owner,third.body.workspaceId]){
   assert.equal((await f.post({action:'delete',workspaceId:id},{Authorization:'Bearer session'})).status,200);
   const current=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
   assert.equal(current.body.accounts.some(row=>row.workspaceId===id),false);
   assert.equal(f.tables.autoreply_instagram_tokens.some(row=>row.user_id===id),false);
 }
 assert.equal(f.tables.autoreply_instagram_memberships.length,3);
 for(let retry=0;retry<3;retry++){
   const current=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
   assert.deepEqual(current.body.accounts,[]);
 }
});

test('disconnect then reconnect at the account limit retains customer history and automation off state',async()=>{
 const f=fixture(1);await f.save();
 f.tables.autoreply_documents.push({user_id:owner,collection:'automations',id:'paused-ai',data:{status:'paused',ai_prompt:'Saved prompt'}});
 f.tables.autoreply_documents.push({user_id:owner,collection:'customer_data',id:'customer-row',data:{name:'Saved customer'}});
 await f.post({action:'delete',workspaceId:owner},{Authorization:'Bearer session'});
 const reconnected=await f.save('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(reconnected.status,200);assert.equal(reconnected.body.workspaceId,owner);
 assert.equal(f.tables.autoreply_instagram_memberships.length,1);assert.equal(f.tables.autoreply_instagram_tokens.length,1);
 assert.equal(f.tables.autoreply_documents.find(r=>r.id==='paused-ai').data.status,'paused');
 assert.equal(f.tables.autoreply_documents.find(r=>r.id==='customer-row').data.name,'Saved customer');
});

test('fresh verified authorization after unlink creates a separate workspace for another login',async()=>{
 const f=fixture();await f.save();await f.post({action:'delete',workspaceId:owner},{Authorization:'Bearer session'});
 const result=await f.post({action:'save',ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accessToken:'private-instagram-token'},{'x-autoreply-oauth-secret':'oauth-secret'});
 assert.equal(result.status,200);assert.equal(f.tables.autoreply_instagram_tokens.length,1);
 assert.notEqual(result.body.workspaceId,owner);
 assert.equal(f.tables.autoreply_instagram_memberships[0].owner_user_id,owner);
});
test('disconnect then Connect a different account hides the old identity and restores only its own history later',async()=>{
 const f=fixture(null);await f.save();
 f.tables.autoreply_documents.push({user_id:owner,collection:'automations',id:'old-rule',data:{status:'paused'}});
 await f.post({action:'delete',workspaceId:owner},{Authorization:'Bearer session'});
 f.setBusiness('business-b');const second=await f.save('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(second.status,200);assert.notEqual(second.body.workspaceId,owner);
 const listed=await f.post({action:'list_accounts'},{Authorization:'Bearer session'});
 assert.equal(listed.body.accounts.some(row=>row.workspaceId===owner),false);
 assert.equal(listed.body.accounts.find(row=>row.workspaceId===second.body.workspaceId).account.status,'connected');
 assert.equal(f.tables.autoreply_instagram_tokens.some(row=>row.user_id===owner),false);
 f.setBusiness('business-a');const restored=await f.save('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.equal(restored.status,200);assert.equal(restored.body.workspaceId,owner);
 assert.equal(f.tables.autoreply_instagram_tokens.length,2);assert.equal(f.tables.autoreply_instagram_memberships.length,2);
 assert.equal(f.tables.autoreply_documents.find(row=>row.id==='old-rule').data.status,'paused');
});
