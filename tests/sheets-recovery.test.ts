import assert from 'node:assert/strict';
import test,{afterEach} from 'node:test';
process.env.INSTAGRAM_APP_SECRET='test-secret';
process.env.GOOGLE_SHEETS_CLIENT_ID='test-google-app';
process.env.GOOGLE_SHEETS_CLIENT_SECRET='test-google-secret';
process.env.SUPABASE_SERVICE_ROLE_KEY='private-test-key';
const {default:handler,sheetRange,sheetColumn}=await import('../api/google-sheets.js');
const uid='12345678-1234-4234-8234-123456789012';
const originalFetch=globalThis.fetch;
afterEach(()=>globalThis.fetch=originalFetch);
const json=(body:any,status=200)=>Response.json(body,{status});
function res(){return {statusCode:200,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;}};}
const req=(action:string,body:any={})=>({method:action==='status'?'GET':'POST',query:{action,automationId:'auto_testing'},headers:{authorization:'Bearer session'},body:{automationId:'auto_testing',...body}});
test('Google revocation is an actionable reconnect state, not a generic bad request',async()=>{
 globalThis.fetch=async(url:any)=>String(url).includes('/auth/')?json({id:uid}):String(url).includes('oauth2.googleapis.com/token')?json({error:'invalid_grant',error_description:'Token has been expired or revoked.'},400):String(url).includes('autoreply_google_connections_secure')?json([{data:{connected:true,refresh_token:'refresh',expires_at:0}}]):json([]);
 const r=res();await handler(req('status'),r);assert.equal(r.statusCode,200);assert.equal(r.body.connected,false);assert.equal(r.body.needsReconnect,true);assert.equal(r.body.code,'GOOGLE_RECONNECT_REQUIRED');assert.match(r.body.error,/Reconnect/);
});
test('server token refresh reads its own workspace credential and persists expiry',async()=>{
 let saved:any,refreshes=0;
 globalThis.fetch=async(url:any,init:any)=>{const value=String(url);if(value.includes('autoreply_google_connections_secure')){if(init.method==='POST'){saved=JSON.parse(init.body);return json({});}return json([{data:{connected:true,refresh_token:'workspace-refresh',expires_at:0}}]);}assert.equal(value,'https://oauth2.googleapis.com/token');refreshes++;return json({access_token:'renewed-private',expires_in:3600});};
 const r=res();await handler({method:'POST',query:{action:'runtime-token'},headers:{'x-autoreply-oauth-secret':'test-secret'},body:{workspaceId:uid}},r);
 assert.equal(r.statusCode,200);assert.equal(refreshes,1);assert.equal(saved.workspace_id,uid);assert.equal(saved.data.access_token,'renewed-private');assert.ok(saved.data.expires_at>Date.now()+3500000);
});
test('sheet setup creates missing tabs before writing and supports more than 26 columns',async()=>{
 const calls:any[]=[];let binding:any={spreadsheet_id:'existing-sheet',state:'legacy',fields:Array.from({length:30},(_,i)=>'Field '+i)};
 globalThis.fetch=async(url:any,init:any={})=>{const value=String(url);calls.push({url:value,...init});
  if(value.includes('/auth/'))return json({id:uid});
  if(value.includes('autoreply_google_connections_secure'))return json([{data:{connected:true,access_token:'token',expires_at:Date.now()+3600000}}]);
  if(value.includes('/rest/')){if(init.method==='POST'){binding=JSON.parse(init.body).data;return json({});}return json([{data:binding}]);}
  if(value.includes('?fields='))return json({sheets:[{properties:{title:'Sheet1',sheetId:0,gridProperties:{columnCount:26}}}]});return json({});};
 const r=res();await handler(req('create-sheet',{fields:['Name']}),r);assert.equal(r.statusCode,200);
 const layout=calls.find(c=>c.url.endsWith(':batchUpdate'));const requests=JSON.parse(layout.body).requests;
 assert.equal(requests.find((r:any)=>r.addSheet?.properties.title==='Leads').addSheet.properties.gridProperties.columnCount,39);
 const firstWrite=calls.findIndex(c=>c.method==='PUT');assert.ok(calls.indexOf(layout)<firstWrite);assert.equal(binding.state,'ready');
});
test('definitive Google 400 creation refusal releases only the new reservation',async()=>{
 const calls:any[]=[];
 globalThis.fetch=async(url:any,init:any={})=>{const value=String(url);calls.push({url:value,...init});if(value.includes('/auth/'))return json({id:uid});if(value.includes('autoreply_google_connections_secure'))return json([{data:{connected:true,access_token:'token',expires_at:Date.now()+3600000}}]);if(value.includes('/rest/'))return json(init.method?'':[]);return json({error:{message:'Bad sheet request'}},400);};
 const r=res();await handler(req('create-sheet',{fields:['Name']}),r);assert.equal(r.statusCode,400);assert.equal(r.body.error,'Bad sheet request');assert.equal(calls.filter(c=>c.method==='DELETE').length,1);assert.match(calls.find(c=>c.method==='DELETE').url,/id=eq.auto_testing/);
});
test('ambiguous create failure keeps reservation and does not dispatch a second create',async()=>{
 let creates=0,deletes=0;
 globalThis.fetch=async(url:any,init:any={})=>{const value=String(url);if(value.includes('/auth/'))return json({id:uid});if(value.includes('autoreply_google_connections_secure'))return json([{data:{connected:true,access_token:'token',expires_at:Date.now()+3600000}}]);if(value.includes('/rest/')){if(init.method==='DELETE')deletes++;return json(init.method?'':[]);}creates++;throw new TypeError('connection lost');};
 const r=res();await handler(req('create-sheet',{fields:['Name']}),r);assert.equal(r.statusCode,503);assert.equal(creates,1);assert.equal(deletes,0);
});
test('A1 ranges quote names with spaces and escape apostrophes',()=>{assert.equal(sheetRange("Customer's leads",'A1'),"'Customer''s leads'!A1");});

test('lead ranges end at the actual last column instead of requesting hundreds of absent columns',()=>{assert.equal(sheetColumn(11),'K');assert.equal(sheetColumn(26),'Z');assert.equal(sheetColumn(39),'AM');});
