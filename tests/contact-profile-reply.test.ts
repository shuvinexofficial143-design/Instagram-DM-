import test from 'node:test';
import assert from 'node:assert/strict';
import { contactIdentity, needsContactProfileRefresh } from '../src/lib/contactIdentity';
import { latestReplyFailureFor, replyFailureDescription } from '../src/lib/inboxReplyOutcome';
import { normalizeActivityLog } from '../src/lib/activityLogs';
import type { Contact, InboxMessage } from '../src/types';
const contact: Contact = {id:'row',ig_user_id:'123456789',ig_user_ids:['987654321'],ig_username:'123456789',interactions:{dms:1,comments:0,stories:0},first_interaction_at:'',last_interaction_at:''};
const message: InboxMessage = {id:'inbound-mid',from_ig_id:'123456789',from_username:'customer',from_avatar:'https://img.example/customer.jpg',direction:'in',message_text:'Price?',timestamp:'2026-10-26T00:00:00Z'};
const failure = (overrides = {}) => normalizeActivityLog({id:'event:inbound-mid',sender_id:'123456789',status:'failed',send_error:'Missing permission',updated_at:'2026-10-26T00:00:01Z',...overrides});

test('Leads recovers handle and real photo using scoped message identity, including aliases',()=>{
  for (const id of ['123456789','987654321']) {
    const identity=contactIdentity(contact,[{...message,from_ig_id:id}]);
    assert.equal(identity.label,'@customer');assert.equal(identity.avatar,message.from_avatar);
  }
  assert.equal(contactIdentity(contact,[{...message,from_ig_id:'foreign'}]).username,'');
});
test('Leads prefers stored verified identity and never labels a numeric ID as an @username',()=>{
  assert.equal(contactIdentity(contact).label,'Instagram user · 6789');
  assert.equal(contactIdentity({...contact,full_name:'Customer Name'}).label,'Customer Name');
  assert.equal(contactIdentity({...contact,ig_username:'New_Name'},[message]).label,'@new_name');
  assert.equal(contactIdentity({...contact,avatar_url:'https://api.dicebear.com/fake'},[message]).avatar,message.from_avatar);
});
test('refresh includes empty usernames with a photo, invalid timestamps and expired photos',()=>{
  const now=Date.parse('2026-10-26T00:00:00Z');
  const complete={...contact,ig_username:'customer',avatar_url:message.from_avatar,profile_refreshed_at:new Date(now-1000).toISOString()};
  assert.equal(needsContactProfileRefresh(complete,now),false);
  for(const change of [{ig_username:''},{ig_username:'123456789'},{profile_refreshed_at:'invalid'},{avatar_url:''},{profile_refreshed_at:new Date(now-86400000).toISOString()}])assert.equal(needsContactProfileRefresh({...complete,...change},now),true);
});
test('reply diagnosis matches the exact inbound event and displays its observed Meta error',()=>{
  const event=latestReplyFailureFor([message],['123456789'],[failure()]);
  assert.ok(event);assert.match(replyFailureDescription(event),/Missing permission/);
  assert.equal(latestReplyFailureFor([message],['123456789'],[failure({id:'event:sheets:inbound-mid'})]),undefined);
  assert.equal(latestReplyFailureFor([message],['123456789'],[failure({sender_id:'foreign'})]),undefined);
  assert.equal(latestReplyFailureFor([message],['123456789'],[failure({id:'event:older-mid'})]),undefined);
});
test('a failed optimistic manual send does not hide the AI failure; confirmed outgoing does',()=>{
  const outgoing={...message,id:'out',direction:'out' as const,timestamp:'2026-10-26T00:00:02Z'};
  for(const state of ['failed','sending'] as const)assert.ok(latestReplyFailureFor([message,{...outgoing,delivery_status:state}],['123456789'],[failure()]));
  assert.equal(latestReplyFailureFor([message,{...outgoing,delivery_status:'sent'}],['123456789'],[failure()]),undefined);
});
test('diagnostics explain deliberate stops and redact credentials from provider errors',()=>{
  assert.match(replyFailureDescription(failure({status:'ignored',reason:'human_handoff'})),/Resume AI/);
  assert.match(replyFailureDescription(failure({status:'ignored',reason:'conversation_context_changed'})),/stale reply/);
  assert.match(replyFailureDescription(failure({reason:'inbox_save_failed'})),/database permissions/);
  const text=replyFailureDescription(failure({send_error:'Bad access_token=private-value Bearer private-key'}));
  assert.ok(!text.includes('private-value')&&!text.includes('private-key'));
});
