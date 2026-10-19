import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';
import {createHmac} from 'node:crypto';
const source = (await fs.readFile('supabase/functions/instagram-account-store/index.ts','utf8')).replace(/^import .*;\n/gm,'');
const compiled = (await transform(source,{loader:'ts',format:'esm'})).code;
const owner='12345678-1234-4234-8234-123456789012';
const scoped='28000000000000001', professional='17840000000000001', customer='770000000000001';
function fixture(options={}) {
  let handler;
  const calls=[];
  const tables={
    autoreply_human_handoffs:options.handoff?[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',workspace_id:owner,sender_id:customer,status:options.resumed?'resumed':'waiting'}]:[],
    autoreply_admin_audit_logs:[],
    autoreply_instagram_tokens:[{user_id:owner,account:{ig_user_id:scoped,username:'business',access_token:'private-token'}}],
    autoreply_instagram_memberships:[{workspace_id:owner,owner_user_id:owner,ig_user_id:scoped}],
    autoreply_documents:[{user_id:owner,collection:'contacts',id:customer,data:{ig_user_id:customer,ig_username:'customer'}}],
  };
  if(options.noContacts) tables.autoreply_documents=[];
  if(options.foreignContact) tables.autoreply_documents[0].user_id='another-workspace';
  const admin={
    auth:{getUser:async token=>token==='session'?{data:{user:{id:owner,...(options.adminSession?{email:'admin@example.test',email_confirmed_at:'2026-10-19'}:{})}}}:{data:null,error:{message:'Unauthorized'}}},
    rpc:async(name,args)=>{
      if(name==='autoreply_set_thread_control'){
        if(options.pauseFails)return {error:{message:'Pause unavailable'}};
        const existing=tables.autoreply_documents.find(r=>r.collection==='ai_thread_controls'&&r.id===args.p_sender);
        const data={...(existing?.data||{}),sender_id:args.p_sender,username:args.p_username,paused:args.p_paused};
        if(existing)existing.data=data;else tables.autoreply_documents.push({user_id:args.p_workspace,collection:'ai_thread_controls',id:args.p_sender,data});
        return {data,error:null};
      }
      return {data:{accounts:5},error:null};
    },
    from(table){let filters={},sets={},mutation,update;
      const q={select(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){sets[k]=v;return q;},
        insert(value){mutation=value;return q;},upsert(value){mutation=value;return q;},update(value){update=value;return q;},
        maybeSingle(){return Promise.resolve(result(true));},then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};
      function result(single){const rows=tables[table]||[];
        const matches=rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v)&&Object.entries(sets).every(([k,v])=>v.includes(row[k])));
        if(update){matches.forEach(row=>Object.assign(row,update));return {data:null,error:null};}
        if(mutation){if(options.pauseFails&&mutation.collection==='ai_thread_controls')return {error:{message:'Pause unavailable'}};
          if(options.saveFails&&table==='autoreply_documents'&&mutation.collection==='inbox_messages')return {error:{message:'Unavailable'}};
          const key=table==='autoreply_instagram_memberships'?'workspace_id':table==='autoreply_instagram_tokens'?'user_id':'id';
          const existing=rows.find(row=>row[key]===mutation[key]&&(key!=='id'||row.collection===mutation.collection&&row.user_id===mutation.user_id));
          if(existing)Object.assign(existing,mutation);else rows.push({...mutation});return {data:null,error:null};}
        return {data:single?matches[0]||null:matches,error:null,count:matches.length};
      }return q;
    }
  };
  const context=vm.createContext({Request,Response,URLSearchParams,AbortSignal,TextEncoder,Uint8Array,crypto:globalThis.crypto,console:{log(){},warn(){},error(){}},
    createClient:()=>admin,
    fetch:async(url,init)=>{calls.push({url:String(url),init});
      if(String(url).includes('/me?'))return Response.json({id:scoped,user_id:professional,username:'business'});
      if(String(url).includes('subscribed_apps'))return Response.json({success:true});
      if(options.timeout)throw new Error('timeout');
      return Response.json(options.metaBody||{message_id:'meta-confirmed',recipient_id:customer},{status:options.metaStatus||200});
    },
    Deno:{env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',INSTAGRAM_APP_SECRET:'oauth-secret'})[key]},serve:value=>handler=value}});
  vm.runInContext(compiled,context);
  return {tables,calls,async post(body,headers={Authorization:'Bearer session'}){const r=await handler(new Request('https://example.supabase.co/functions/v1/instagram-account-store',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
const send={action:'send_dm',workspaceId:owner,recipientUsername:'@customer',messageText:'Reply'};
test('registration uses verified professional ID and reuses the legacy scoped-ID workspace',async()=>{
  const f=fixture();const r=await f.post({action:'save',workspaceId:owner,ownerId:owner,accessToken:'new-private-token'},{'x-autoreply-oauth-secret':'oauth-secret'});
  assert.equal(r.status,200);assert.equal(r.body.workspaceId,owner);
  assert.equal(f.tables.autoreply_instagram_tokens.length,1);
  assert.equal(f.tables.autoreply_instagram_tokens[0].account.ig_user_id,professional);
  assert.equal(f.tables.autoreply_instagram_tokens[0].account.ig_scoped_id,scoped);
  assert.equal(f.tables.autoreply_instagram_memberships[0].ig_user_id,professional);
  assert.ok(new URL(f.calls[0].url).searchParams.get('fields').split(',').includes('user_id'));
  assert.ok(!JSON.stringify(r.body).includes('private-token'));
});
test('loading a legacy connection repairs both token and membership identities',async()=>{
  const f=fixture();const r=await f.post({action:'load',workspaceId:owner});
  assert.equal(r.status,200);assert.equal(r.body.account.ig_user_id,professional);
  assert.equal(f.tables.autoreply_instagram_memberships[0].ig_user_id,professional);
});
test('manual reply sends to the scoped contact ID and saves the confirmed Meta message ID',async()=>{
  const f=fixture();const r=await f.post(send);
  assert.equal(r.status,200);assert.equal(r.body.sent,true);assert.equal(r.body.message_id,'meta-confirmed');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://graph.instagram.com/v25.0/me/messages');
  assert.equal(JSON.parse(f.calls[0].init.body).recipient.id,customer);
  const rows=f.tables.autoreply_documents.filter(row=>row.collection==='inbox_messages');
  assert.equal(rows.length,1);assert.equal(rows[0].id,'meta-confirmed');assert.equal(rows[0].data.delivery_status,'sent');
  assert.ok(!JSON.stringify(r.body).includes('private-token'));
});
test('manual replies refuse unauthenticated callers and foreign workspaces before sending',async()=>{
  const f=fixture();assert.equal((await f.post(send,{})).status,401);
  assert.equal((await f.post({...send,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})).status,403);
  assert.equal(f.calls.length,0);
});
test('contact usernames from another workspace and missing recipients cannot be dispatched',async()=>{
  for(const options of [{foreignContact:true},{noContacts:true}]){const f=fixture(options);assert.equal((await f.post(send)).status,409);assert.equal(f.calls.length,0);}
});
test('Meta refusal and missing confirmation never create a sent Inbox message',async()=>{
  for(const options of [{metaStatus:403,metaBody:{error:{message:'Missing permission',code:10}}},{metaBody:{success:true}}]){
    const f=fixture(options);const r=await f.post(send);assert.equal(r.status,502);assert.equal(r.body.sent,false);
    assert.equal(f.tables.autoreply_documents.filter(row=>row.collection==='inbox_messages').length,0);
  }
});
test('an ambiguous timeout is dispatched once and is never reported as sent',async()=>{
  const f=fixture({timeout:true});const r=await f.post(send);assert.equal(r.status,502);assert.equal(r.body.sent,false);assert.equal(f.calls.length,1);
});
test('confirmed delivery stays confirmed if the Inbox write is unavailable',async()=>{
  const f=fixture({saveFails:true});const r=await f.post(send);assert.equal(r.body.sent,true);assert.equal(r.body.inbox_saved,false);assert.equal(f.calls.length,1);
});
const relaySource=(await fs.readFile('src/server/manualDm.ts','utf8')).replace(/^import .*;\n/gm,'');
const relayCompiled=(await transform(relaySource.replace('export default async function handler','async function handler')+'\nglobalThis.handler=handler;',{loader:'ts'})).code;
async function relay(req,{identity={id:owner},body={ok:true,sent:true,message_id:'mid',message:{id:'mid'}},status=200,authError}={}){
  const calls=[];const context=vm.createContext({AbortSignal,SUPABASE_URL:'https://example.supabase.co',
    authenticatedWorkspace:async()=>{if(authError)throw Object.assign(new Error('Forbidden'),{status:403});return identity;},
    readCookie:()=>'',guestStoreHeaders:()=>({}),enforceRateLimit:()=>({allowed:true}),
    httpFetch:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json(body,{status});}});
  vm.runInContext(relayCompiled,context);
  const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await context.handler(req,res);return {res,calls};
}
test('Vercel relay derives workspace from authenticated ownership, ignoring body userId',async()=>{
  const {res,calls}=await relay({method:'POST',headers:{authorization:'Bearer session'},body:{...send,userId:'victim'}});
  assert.equal(res.statusCode,200);assert.equal(calls[0].workspaceId,owner);assert.equal(calls[0].userId,undefined);
});
test('Vercel relay rejects foreign account selection, expired auth and unconfirmed upstream results',async()=>{
  const req={method:'POST',headers:{authorization:'Bearer session'},body:send};
  assert.equal((await relay(req,{authError:true})).res.statusCode,403);
  assert.equal((await relay(req,{identity:null})).res.statusCode,401);
  assert.equal((await relay(req,{body:{success:true}})).res.statusCode,502);
});
test('production DM URL resolves to an existing Vercel function',async()=>{
  const config=JSON.parse(await fs.readFile('vercel.json','utf8'));
  assert.equal(config.rewrites.find(r=>r.source==='/api/instagram/send-dm')?.destination,'/api/instagram/account?action=send-dm');
  assert.match(await fs.readFile('api/instagram/account.ts','utf8'),/req.query\?\.action === 'send-dm'.*manualDmHandler/);
});

test('manual replies durably pause AI by Instagram sender ID before sending',async()=>{
 const f=fixture();const r=await f.post(send);assert.equal(r.status,200);
 const control=f.tables.autoreply_documents.find(row=>row.collection==='ai_thread_controls');
 assert.equal(control.id,customer);assert.equal(control.data.paused,true);assert.equal(control.data.username,'customer');
});
test('manual reply stops if the AI takeover cannot be persisted',async()=>{
 const f=fixture({pauseFails:true});const r=await f.post(send);assert.equal(r.status,503);assert.equal(f.calls.length,0);
});

const adminHandoffReply={action:'admin_handoff_reply',handoffId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',messageText:'A human reply',workspaceId:'forged',recipientUsername:'forged'};
function adminHeaders(action='admin_handoff_reply'){
 const timestamp=String(Date.now());return {Authorization:'Bearer session','x-autoreply-admin-time':timestamp,'x-autoreply-admin-signature':createHmac('sha256','oauth-secret').update(`${action}\nsession\n${timestamp}`).digest('hex')};
}
test('handoff replies need a verified signed admin relay and cannot select a forged target',async()=>{
 const f=fixture({adminSession:true,handoff:true});assert.equal((await f.post(adminHandoffReply)).status,403);assert.equal(f.calls.length,0);
 assert.equal((await f.post(adminHandoffReply,adminHeaders('admin_overview'))).status,403);
 const sent=await f.post(adminHandoffReply,adminHeaders());assert.equal(sent.status,200);assert.equal(sent.body.sent,true);
 assert.equal(JSON.parse(f.calls[0].init.body).recipient.id,customer);
 assert.equal(f.tables.autoreply_admin_audit_logs.length,1);
 assert.ok(!JSON.stringify(sent.body).includes('private-token'));
});
test('closed handoffs and unverified users cannot send an admin reply',async()=>{
 for(const options of [{adminSession:true,handoff:true,resumed:true},{handoff:true}]){
  const f=fixture(options);const r=await f.post(adminHandoffReply,adminHeaders());assert.ok([403,409].includes(r.status));assert.equal(f.calls.length,0);
 }
});
