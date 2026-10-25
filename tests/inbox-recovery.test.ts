import test from 'node:test';
import assert from 'node:assert/strict';
import { pageRecoveredInbox } from '../src/lib/inboxRecovery';
import type {InboxMessage} from '../src/types';
const row=(id:string,sender:string,date:string,direction:'in'|'out'='in',is_read=false)=>({
  id,created_at:date,data:{id,from_ig_id:sender,from_username:sender,message_text:'Message '+id,timestamp:date,direction,is_read} as InboxMessage,
});
test('RPC recovery returns a complete unread ledger and a bounded latest message page',()=>{
  const rows=[row('a','111','2026-10-20T00:00:00Z'),row('b','222','2026-10-21T00:00:00Z'),row('c','111','2026-10-22T00:00:00Z','out'),row('d','111','2026-10-23T00:00:00Z','in',true)];
  const page=pageRecoveredInbox(rows,'',null,2);
  assert.deepEqual(page.messages.map(m=>m.id),['d','c']);
  assert.equal(page.unread_counts?.['111'],1);
  assert.equal(page.unread_counts?.['222'],1);
  assert.equal(page.has_more,true);
  assert.deepEqual(pageRecoveredInbox(rows,'',page.next_cursor,2).messages.map(m=>m.id),['b','a']);
});
test('RPC recovery never mixes different Instagram sender IDs',()=>{
  const rows=[row('a','111','2026-10-20T00:00:00Z'),row('b','222','2026-10-21T00:00:00Z')];
  assert.deepEqual(pageRecoveredInbox(rows,'111').messages.map(m=>m.id),['a']);
  assert.deepEqual(pageRecoveredInbox(rows,'@222').messages.map(m=>m.id),['b']);
});
test('RPC recovery handles more than the first 50 messages without claiming the rest are absent',()=>{
  const rows=Array.from({length:110},(_,i)=>row(String(i).padStart(3,'0'),'111',new Date(Date.UTC(2026,9,20,0,i)).toISOString()));
  let cursor=null;
  let results:string[]=[];
  for(let n=0;n<3;n++){
    const page=pageRecoveredInbox(rows,'111',cursor,50);
    results.push(...page.messages.map(m=>m.id));
    cursor=page.next_cursor;
    assert.equal(page.unread_counts?.['111'],110);
  }
  assert.equal(new Set(results).size,110);
  assert.equal(results.length,110);
});
test('RPC recovery does not turn missing profile names or photos into invented customer data',()=>{
  const bare={id:'opaque',data:{from_ig_id:'123456789',from_username:'',direction:'in' as const,message_text:'hello'}};
  const message=pageRecoveredInbox([bare]).messages[0];
  assert.equal(message.from_username,'123456789');
  assert.equal(message.from_avatar,'');
});
