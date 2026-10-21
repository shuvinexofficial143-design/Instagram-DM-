import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInboxThreads} from '../src/lib/inboxIdentity';
import type {Contact,InboxMessage} from '../src/types';
const contact=(id:string,name:string,aliases:string[]=[]):Contact=>({id,ig_user_id:id,ig_user_ids:aliases,ig_username:name,first_interaction_at:'',last_interaction_at:'',interactions:{comments:0,dms:0,stories:0}});
const msg=(id:string,sender:string,name:string):InboxMessage=>({id,from_ig_id:sender,from_username:name,message_text:'Same text',direction:'in',timestamp:'2026-10-21T00:00:00Z'});
test('numeric fallback and later handle for one sender are a single conversation',()=>{
 const threads=buildInboxThreads([msg('1','12345','12345'),msg('2','12345','customer')],[contact('12345','customer')]);
 assert.equal(threads.length,1);assert.equal(threads[0].label,'@customer');assert.equal(threads[0].messages.length,2);assert.equal(threads[0].actionKey,'12345');
});
test('explicit scoped aliases preserve all history and metadata lookup keys',()=>{
 const c=contact('12345','new_handle',['12345','67890']);c.ig_user_id='67890';
 const threads=buildInboxThreads([msg('1','12345','old_handle'),msg('2','67890','67890')],[c]);
 assert.equal(threads.length,1);assert.equal(threads[0].key,'12345');assert.equal(threads[0].actionKey,'67890');
 for(const key of ['12345','67890','old_handle','new_handle'])assert.ok(threads[0].aliases.includes(key));
});
test('identical messages and timestamps never merge different customer IDs',()=>{
 const threads=buildInboxThreads([msg('1','12345','12345'),msg('2','67890','67890')],[]);
 assert.equal(threads.length,2);assert.ok(threads.every(t=>!t.label.startsWith('@')));
});
test('a known profile supplies the handle when every message still has its numeric fallback',()=>{
 assert.equal(buildInboxThreads([msg('1','12345','12345')],[contact('12345','@Customer')])[0].label,'@customer');
});
test('a username change keeps the same conversation key and older handle searchable',()=>{
 const old=buildInboxThreads([msg('1','12345','old_handle')],[])[0];
 const next=buildInboxThreads([msg('1','12345','old_handle')],[contact('12345','new_handle')])[0];
 assert.equal(old.key,next.key);assert.equal(next.label,'@new_handle');assert.ok(next.aliases.includes('old_handle'));
});
test('numeric IDs are shown as an honest unavailable profile, never a fake @handle',()=>{
 const c=contact('12345','12345');assert.equal(buildInboxThreads([], [c])[0].label,'Instagram user · 2345');
 c.full_name='Customer Name';assert.equal(buildInboxThreads([], [c])[0].label,'Customer Name');
});
test('optimistic manual replies stay in their selected numeric-ID conversation',()=>{
 assert.equal(buildInboxThreads([msg('1','ig_usr_12345','12345')],[contact('12345','customer')]).length,1);
});
test('legacy username-only messages attach only to an unambiguous known contact',()=>{
 assert.equal(buildInboxThreads([msg('1','','customer')],[contact('12345','customer')]).length,1);
 const threads=buildInboxThreads([msg('1','','customer')],[contact('12345','customer'),contact('67890','customer')]);assert.equal(threads.length,3);
});

test('messages with no username still keep their sender ID and history',()=>{
 const threads=buildInboxThreads([msg('1','12345','')],[]);assert.equal(threads.length,1);assert.equal(threads[0].messages.length,1);
});
