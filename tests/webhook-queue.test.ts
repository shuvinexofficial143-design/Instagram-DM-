import assert from 'node:assert/strict';
import { test,afterEach } from 'node:test';
import { createHash } from 'node:crypto';
import { authorizedQueueDrain,queueWebhookEvent,finishWebhook,durableWebhookEnabled } from '../src/server/webhookQueue.js';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
test('only the configured private queue secret can drain retries',()=>{
 const old=process.env.WEBHOOK_QUEUE_SECRET;process.env.WEBHOOK_QUEUE_SECRET='unit-test-private-key';
 assert.equal(authorizedQueueDrain({headers:{'x-autoreply-queue-secret':'wrong'}}),false);
 assert.equal(authorizedQueueDrain({headers:{'x-autoreply-queue-secret':'unit-test-private-key'}}),true);
 if(old===undefined)delete process.env.WEBHOOK_QUEUE_SECRET;else process.env.WEBHOOK_QUEUE_SECRET=old;
});
test('webhook queue is opt-in and disabled until rollout is verified',()=>{
 const old=process.env.WEBHOOK_DURABLE_QUEUE_ENABLED;delete process.env.WEBHOOK_DURABLE_QUEUE_ENABLED;
 assert.equal(durableWebhookEnabled(),false);
 if(old===undefined)delete process.env.WEBHOOK_DURABLE_QUEUE_ENABLED;else process.env.WEBHOOK_DURABLE_QUEUE_ENABLED=old;
});
test('signed duplicate event payload stores only one queue record',async()=>{
 const old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='unit-test-private-db-key';
 const payload={object:'instagram',entry:[]},raw=Buffer.from(JSON.stringify(payload));const hash=createHash('sha256').update(raw).digest('hex');
 let inserts=0,stored=false,completed=false;
 globalThis.fetch=async(url,init)=>{
  const method=init.method||'GET',path=String(url);
  if(method==='POST'&&path.includes('autoreply_webhook_queue?on_conflict=')){
    inserts++;const first=!stored;stored=true;return new Response(JSON.stringify(first?[{event_hash:hash}]:[]),{status:201});
  }
  if(method==='GET'&&path.includes('autoreply_webhook_queue'))return new Response(JSON.stringify([{status:completed?'processed':'processing'}]));
  if(method==='PATCH'&&path.includes('autoreply_webhook_queue')){completed=JSON.parse(init.body).status==='processed';return new Response('[]');}
  throw new Error('Unexpected queue request '+path);
 };
 try{
  const first=await queueWebhookEvent(raw,payload);assert.equal(first.created,true);assert.equal(first.hash,hash);
  const duplicate=await queueWebhookEvent(raw,payload);assert.equal(duplicate.created,false);
  assert.equal(inserts,2);
  await finishWebhook(first.hash,first.lease,true,1);
  const again=await queueWebhookEvent(raw,payload);assert.equal(again.status,'processed');
 }finally{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old}
});
