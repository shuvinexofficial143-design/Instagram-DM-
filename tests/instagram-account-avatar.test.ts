import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateInstagramAccountAvatars} from '../src/server/instagramAccountAvatar';

const workspace='12345678-1234-4234-8234-123456789012';
const old='https://scontent-bom5-1.cdninstagram.com/expired-profile.jpg';
const fresh='https://scontent-bom5-1.cdninstagram.com/fresh-profile.jpg';
const jpeg=new Uint8Array([255,216,255,224,0,1,2,3]);
const account={id:'primary',ig_user_id:'995500011',ig_scoped_id:'995500022',username:'my_business',status:'connected',profile_pic_url:old};
const items=[{workspaceId:workspace,account}];

test('expired Meta URL is refreshed, cached and returned without leaking OAuth credentials',async()=>{
 const calls:string[]=[];
 const db=async(path:string,method='GET',body?:any)=>{
  calls.push(path);
  if(path.includes('autoreply_instagram_tokens?'))return [{user_id:workspace,account:{...account,access_token:'secret-token-not-for-client'}}];
  assert.equal(path,'rpc/autoreply_cache_instagram_account_photo');
  assert.equal(method,'POST');
  assert.equal(body.p_expected_photo,old);
  assert.equal(body.p_workspace,workspace);
  assert.match(body.p_cached_photo,/^data:image\/jpeg;base64,/);
  return true;
 };
 const fetcher=async(url:any,options:any)=>{
  const value=String(url);
  if(value===old){assert.equal(options.headers,undefined);return new Response(null,{status:403});}
  if(value.startsWith('https://graph.instagram.com/')){
   assert.equal(options.headers.Authorization,'Bearer secret-token-not-for-client');
   return Response.json({id:account.ig_scoped_id,user_id:account.ig_user_id,username:account.username,profile_picture_url:fresh});
  }
  assert.equal(value,fresh);
  assert.equal(options.headers,undefined);
  return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
 };
 const output=await hydrateInstagramAccountAvatars(items,{db:db as any,fetcher:fetcher as any});
 assert.match(output[0].account.profile_pic_url,/^data:image\/jpeg;base64,/);
 assert.ok(!JSON.stringify(output).includes('secret-token-not-for-client'));
 assert.ok(!JSON.stringify(output).includes(old));
 assert.ok(calls.includes('rpc/autoreply_cache_instagram_account_photo'));
 assert.equal(items[0].account.profile_pic_url,old,'the original account remains unchanged');
});

test('recently cached thumbnails need no database or Meta requests',async()=>{
 const existing='data:image/jpeg;base64,'+Buffer.from(jpeg).toString('base64');
 let calls=0;
 const output=await hydrateInstagramAccountAvatars([{workspaceId:workspace,account:{...account,profile_pic_url:existing,profile_photo_cached_at:new Date().toISOString()}}],{
  db:(async()=>{calls++;throw Error('not expected');}) as any,
  fetcher:(async()=>{calls++;throw Error('not expected');}) as any
 });
 assert.equal(output[0].account.profile_pic_url,existing);
 assert.equal(calls,0);
});

test('a mismatched Meta identity cannot replace another Instagram account photo',async()=>{
 let saved=0;
 const db=async(path:string)=>{
  if(path.includes('autoreply_instagram_tokens?'))return [{user_id:workspace,account:{...account,access_token:'private'}}];
  saved++;return true;
 };
 const fetcher=async(url:any)=>String(url)===old?new Response(null,{status:403}):
   Response.json({id:'wrong-business',user_id:'wrong-id',profile_picture_url:fresh});
 const output=await hydrateInstagramAccountAvatars(items,{db:db as any,fetcher:fetcher as any});
 assert.equal(output[0].account.profile_pic_url,old);
 assert.equal(saved,0);
});

test('failed photo download does not disconnect an account or erase its existing data',async()=>{
 const db=async(path:string)=>path.includes('autoreply_instagram_tokens?')?[{user_id:workspace,account:{...account,access_token:'private'}}]:(()=>{throw Error('No write expected');})();
 const fetcher=async()=>new Response(null,{status:403});
 const output=await hydrateInstagramAccountAvatars(items,{db:db as any,fetcher:fetcher as any});
 assert.equal(output[0].account.status,'connected');
 assert.equal(output[0].account.profile_pic_url,old);
});

test('a concurrent reconnect prevents stale avatar overwrites',async()=>{
 const db=async(path:string)=>path.includes('autoreply_instagram_tokens?')
  ?[{user_id:workspace,account:{...account,access_token:'private'}}]:false;
 const fetcher=async()=>new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
 const output=await hydrateInstagramAccountAvatars(items,{db:db as any,fetcher:fetcher as any});
 assert.equal(output[0].account.profile_pic_url,old);
});
